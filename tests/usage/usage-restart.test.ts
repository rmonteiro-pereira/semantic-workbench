// Tests that a clean stop loses no counts and an unclean stop loses only what was not yet written.
import { afterEach, expect, test } from 'bun:test';
import { createHandler } from '../../src/server/handler';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { createUsageStore } from '../../src/server/usage/usage-store';
import { measureTotal } from '../../src/server/usage/usage-counts';
import { utcDay } from '../../src/server/usage/usage-retention';
import { publishFixture } from '../helpers/published-workspace';
import { testWorkspace } from '../helpers/temp-data-dir';

const PROJECT = 'ungrouped';
const MAPPING_ID = `${PROJECT}/commerce.mapping.yaml`;
const request = () => new Request(`http://localhost/api/agent/context?project=${PROJECT}&mappingId=${encodeURIComponent(MAPPING_ID)}`);
const metric = 'sw1:ungrouped/commerce.mapped-semantic.yaml#model:Mapped%20commerce%20semantic%20model/metric:gross_revenue';
const settings = { enabled: true, retentionDays: 30 };

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

function storedTotal(fixture: Awaited<ReturnType<typeof commerceWorkspace>>) {
  const read = createUsageStore(fixture.ws.layout).readDay(PROJECT, utcDay(new Date()));
  if (read.status !== 'ok' || !read.file.counts[metric]) return 0;
  return measureTotal(read.file.counts[metric], 'workbench-requests');
}

test('a clean stop writes every count and a restart finds them', async () => {
  const fixture = await commerceWorkspace();
  const handler = createHandler(fixture.ws, { usageSettings: settings });
  await handler(request());
  await handler(request());
  await handler.usage.settled();
  expect(storedTotal(fixture)).toBe(0);
  handler.usage.close();
  expect(storedTotal(fixture)).toBe(2);
  const restarted = createHandler(fixture.ws, { usageSettings: settings });
  await restarted(request());
  await restarted.usage.settled();
  restarted.usage.close();
  expect(storedTotal(fixture)).toBe(3);
});

test('an unclean stop keeps what was written and loses only what was not', async () => {
  const fixture = await commerceWorkspace();
  const handler = createHandler(fixture.ws, { usageSettings: settings });
  await handler(request());
  await handler.usage.settled();
  handler.usage.flush();
  await handler(request());
  await handler.usage.settled();
  expect(storedTotal(fixture)).toBe(1);
  const restarted = createHandler(fixture.ws, { usageSettings: settings });
  await restarted(request());
  await restarted.usage.settled();
  restarted.usage.close();
  expect(storedTotal(fixture)).toBe(2);
});
