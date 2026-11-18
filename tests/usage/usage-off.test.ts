// Tests that with counters off nothing is created or kept, and that counters never change an answer.
import { afterEach, expect, spyOn, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { createHandler } from '../../src/server/handler';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { NO_USAGE_RECORDER } from '../../src/server/usage/usage-recorder';
import { publishFixture } from '../helpers/published-workspace';
import { testWorkspace } from '../helpers/temp-data-dir';

const PROJECT = 'ungrouped';
const MAPPING = encodeURIComponent(`${PROJECT}/commerce.mapping.yaml`);
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

const counted = [
  new Request(`http://localhost/api/agent/context?project=${PROJECT}&mappingId=${MAPPING}`),
  new Request(`http://localhost/api/agent/context?project=${PROJECT}&mappingId=${MAPPING}&concept=Revenue`),
  new Request('http://localhost/api/agent/plan', { method: 'POST', body: JSON.stringify({ project: PROJECT, mappingId: decodeURIComponent(MAPPING), metrics: ['gross_revenue'], dimensions: [] }) }),
  new Request(`http://localhost/api/projects/${PROJECT}/files/commerce.mapped-semantic.yaml/explain/gross_revenue`),
  new Request(`http://localhost/api/projects/${PROJECT}/files/commerce.mapped-semantic.yaml/explain/absent_metric`),
  new Request(`http://localhost/api/agent/context?project=${PROJECT}`),
];

async function describeAnswer(response: Response) {
  const headers = [...response.headers.entries()].filter(([name]) => name !== 'x-request-id').sort();
  return { status: response.status, headers, body: await response.text() };
}

test('with counters off no folder is created, no timer starts and the recorder is the no-op', async () => {
  const fixture = await commerceWorkspace();
  const timers = spyOn(globalThis, 'setInterval');
  const handler = createHandler(fixture.ws);
  const started = timers.mock.calls.length;
  timers.mockRestore();
  expect(started).toBe(0);
  expect(handler.usage).toBe(NO_USAGE_RECORDER);
  for (const request of counted) await handler(request.clone());
  expect(handler.usage.pending(PROJECT)).toEqual([]);
  expect(existsSync(fixture.ws.layout.usage)).toBe(false);
});

test('with counters on the answers of every counted operation equal the answers with counters off', async () => {
  const fixture = await commerceWorkspace();
  const off = createHandler(fixture.ws);
  const on = createHandler(fixture.ws, { usageSettings: { enabled: true, retentionDays: 30 } });
  for (const request of counted) {
    const expected = await describeAnswer(await off(request.clone()));
    const actual = await describeAnswer(await on(request.clone()));
    expect(actual, request.url).toEqual(expected);
  }
  await on.usage.settled();
  on.usage.close();
});
