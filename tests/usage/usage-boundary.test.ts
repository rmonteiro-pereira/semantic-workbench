// Tests counting through the real operation boundary: an application client over HTTP, a browser
// request, and a recorder that fails. Counting for protocol clients is in usage-mcp-tools.test.ts.
import { afterEach, describe, expect, test } from 'bun:test';
import { createHandler } from '../../src/server/handler';
import { NO_USAGE_RECORDER } from '../../src/server/usage/usage-recorder';
import { measureTotal } from '../../src/server/usage/usage-counts';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { publishFixture } from '../helpers/published-workspace';
import { testWorkspace } from '../helpers/temp-data-dir';

const disposers: (() => void)[] = [];
afterEach(() => {
  while (disposers.length) disposers.pop()!();
});

async function commerceWorkspace() {
  const fixture = await testWorkspace();
  for (const file of ['commerce.mapping.yaml', 'commerce.mapped-ontology.yaml', 'commerce.mapped-semantic.yaml']) {
    await fixture.ws.saveDocument(file, await Bun.file('public/examples/commerce/' + file).text(), LOCAL_READER);
  }
  await publishFixture(fixture);
  disposers.push(fixture.dispose);
  return fixture;
}

// A workspace places loose documents in this project.
const PROJECT = 'ungrouped';
const MAPPING_ID = `${PROJECT}/commerce.mapping.yaml`;
const contextPath = `/api/agent/context?project=${PROJECT}&mappingId=${encodeURIComponent(MAPPING_ID)}`;
const metric = 'sw1:ungrouped/commerce.mapped-semantic.yaml#model:Mapped%20commerce%20semantic%20model/metric:gross_revenue';

function total(handler: { usage: { pending(project: string): any[] } }, address: string) {
  return handler.usage.pending(PROJECT).reduce((sum, day) => sum + (day.counts[address] ? measureTotal(day.counts[address], 'workbench-requests') : 0), 0);
}

describe('counting through the boundary', () => {
  test('an application client over HTTP is counted under the http origin', async () => {
    const fixture = await commerceWorkspace();
    const handler = createHandler(fixture.ws, { usageSettings: { enabled: true, retentionDays: 30 } });
    expect((await handler(new Request('http://localhost' + contextPath))).status).toBe(200);
    await handler.usage.settled();
    const counts = handler.usage.pending(PROJECT)[0].counts[metric]['workbench-requests']['agent.context.read'];
    expect(counts).toEqual({ http: 1 });
    handler.usage.close();
  });

  test('a plan request is counted and a catalog listing is not', async () => {
    const fixture = await commerceWorkspace();
    const handler = createHandler(fixture.ws, { usageSettings: { enabled: true, retentionDays: 30 } });
    await handler(new Request(`http://localhost/api/agent/catalog?project=${PROJECT}`));
    expect(handler.usage.pending(PROJECT)).toEqual([]);
    const plan = new Request('http://localhost/api/agent/plan', { method: 'POST', body: JSON.stringify({ project: PROJECT, mappingId: MAPPING_ID, metrics: ['gross_revenue'], dimensions: [] }) });
    expect((await handler(plan)).status).toBe(200);
    await handler.usage.settled();
    expect(total(handler, metric)).toBe(1);
    handler.usage.close();
  });

  test('a browser request, a refused request and an unpublished preview add nothing', async () => {
    const fixture = await commerceWorkspace();
    const handler = createHandler(fixture.ws, { usageSettings: { enabled: true, retentionDays: 30 } });
    await handler(new Request('http://localhost' + contextPath, { headers: { 'sec-fetch-site': 'same-origin' } }));
    await handler(new Request('http://localhost' + contextPath.replace(PROJECT, 'nobody')));
    await handler(new Request(`http://localhost/api/preview/context?project=${PROJECT}&mappingId=${encodeURIComponent(MAPPING_ID)}`, { headers: { 'sec-fetch-site': 'same-origin' } }));
    await handler.usage.settled();
    expect(handler.usage.pending(PROJECT)).toEqual([]);
    handler.usage.close();
  });

  test('a recorder that throws does not change the answer', async () => {
    const fixture = await commerceWorkspace();
    const plain = createHandler(fixture.ws, { usage: NO_USAGE_RECORDER });
    const broken = createHandler(fixture.ws, {
      usage: {
        ...NO_USAGE_RECORDER,
        record() {
          throw new Error('broken');
        },
      },
    });
    const expected = await plain(new Request('http://localhost' + contextPath));
    const answer = await broken(new Request('http://localhost' + contextPath));
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual(await expected.json());
  });
});
