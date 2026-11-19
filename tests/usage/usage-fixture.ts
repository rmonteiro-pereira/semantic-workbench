// Builds a recorder over a temporary data root with a fixed clock and the commerce example as the
// published snapshot, so usage tests choose only what they vary.
import { dataLayout } from '../../src/server/projects/paths';
import { createUsageStore } from '../../src/server/usage/usage-store';
import { createUsageRecorder, SNAPSHOT_HEADER, type UsageRecordInput, type UsageRecorderDeps } from '../../src/server/usage/usage-recorder';
import { DEFAULT_USAGE_RETENTION_DAYS } from '../../src/server/usage/usage-settings';
import { tempDataDir } from '../helpers/temp-data-dir';
import { PROJECT, commerceDocuments, contextAnswer, modelsOf, planAnswer } from './commerce-answers';

/** A clock the test moves by hand. */
export function fakeClock(start = '2026-11-17T10:00:00.000Z') {
  let current = new Date(start).getTime();
  return {
    now: () => new Date(current),
    set(value: string) {
      current = new Date(value).getTime();
    },
    advance(milliseconds: number) {
      current += milliseconds;
    },
  };
}

/** The answer of a published context request, with the snapshot header the counting rule needs. */
export function publishedJson(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, { ...init, headers: { [SNAPSHOT_HEADER]: 'a'.repeat(40), ...init.headers } });
}

/** A finished request as the operation boundary reports it; overrides change one fact at a time. */
export function contextRequest(documents: any[], overrides: Partial<UsageRecordInput> = {}): UsageRecordInput {
  return {
    operationId: 'agent.context.read',
    origin: 'http',
    surface: 'agent',
    outcome: 'ok',
    target: {},
    response: publishedJson(contextAnswer(documents)),
    ...overrides,
  };
}

/** A finished plan request. */
export function planRequest(documents: any[], overrides: Partial<UsageRecordInput> = {}): UsageRecordInput {
  return contextRequest(documents, { operationId: 'agent.plan', response: publishedJson(planAnswer(documents)), ...overrides });
}

/** Opens a recorder with counters on over a temporary data root. */
export async function openUsage(overrides: Partial<UsageRecorderDeps> = {}) {
  const directory = tempDataDir('usage-recorder-');
  const layout = dataLayout(directory.root);
  const store = createUsageStore(layout);
  const documents = await commerceDocuments();
  const models = modelsOf(documents);
  const clock = fakeClock();
  const warnings: { event: string; fields: Record<string, unknown> }[] = [];
  const recorder = createUsageRecorder({
    settings: { enabled: true, retentionDays: DEFAULT_USAGE_RETENTION_DAYS },
    store,
    models: async () => models,
    migrationRecords: () => [],
    now: clock.now,
    warn: (event, fields) => warnings.push({ event, fields }),
    ...overrides,
  });
  return {
    recorder,
    store,
    layout,
    documents,
    models,
    clock,
    warnings,
    project: PROJECT,
    dispose() {
      recorder.close();
      directory.cleanup();
    },
  };
}
