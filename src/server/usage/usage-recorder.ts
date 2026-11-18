// Counts the items of successful, authorized answers and keeps them in memory until the next flush.
// The recorder never changes an answer, never waits for the disk on a request and never fails a
// request: counting problems are logged and dropped. With counters off the no-op recorder is used.
import type { MigrationRecord } from '../../shared/core/address-migration';
import { CALLER_ORIGINS } from '../auth/operation-inventory';
import { OPERATION_OUTCOMES, type OperationOutcome } from '../../shared/observability/operation';
import { log } from '../observability/log';
import { countedOperation, type CountedOperation } from './usage-counted-operations';
import { addCount, emptyDayFile, MAX_ADDRESSES_PER_DAY, MAX_COUNT, type CounterDayFile } from './usage-counts';
import { compactUsage } from './usage-compaction';
import { decideFlush } from './usage-flush';
import { itemAddresses, answerProject, type PublishedModels, type RouteTarget } from './usage-items';
import { utcDay } from './usage-retention';
import type { UsageStore } from './usage-store';
import type { UsageSettings } from './usage-settings';

/** Header that marks an answer as read from a published snapshot. */
export const SNAPSHOT_HEADER = 'X-Workbench-Snapshot';
/** Answers larger than this are not parsed: twice the document size limit. */
export const MAX_COUNTED_RESPONSE_BYTES = 4_000_000;
/** How often memory is written to disk. */
export const DEFAULT_FLUSH_INTERVAL_MS = 30_000;
const MAX_ACTIVE_RECORDINGS = 16;
const WARNING_INTERVAL_MS = 3_600_000;

/** What the operation boundary tells the recorder about one finished request. No identity is among it. */
export type UsageRecordInput = {
  operationId: string;
  origin: string;
  surface: 'browser' | 'agent' | undefined;
  outcome: OperationOutcome;
  target: RouteTarget;
  response: Response;
};

/** Loads the parsed definition models of one published snapshot; null when it cannot be read. */
export type PublishedModelSource = (project: string, commit: string) => Promise<PublishedModels | null>;

/** The counting side the operation boundary and the read operation talk to. */
export type UsageRecorder = {
  readonly enabled: boolean;
  record(input: UsageRecordInput): void;
  /** Copies of the days memory holds for a project, not yet on disk. */
  pending(project: string): CounterDayFile[];
  /** Resolves when every request handed to `record` has been counted. */
  settled(): Promise<void>;
  flush(): void;
  /** Stops admission and the timer, then drains recordings before the final flush. */
  close(): Promise<void>;
};

/** The recorder used while counters are off: it keeps nothing and does nothing. */
export const NO_USAGE_RECORDER: UsageRecorder = {
  enabled: false,
  record() {},
  pending: () => [],
  settled: () => Promise.resolve(),
  flush() {},
  close: () => Promise.resolve(),
};

/** Everything the real recorder needs, passed in so tests choose the clock, the disk and the snapshot. */
export type UsageRecorderDeps = {
  settings: UsageSettings;
  store: UsageStore;
  models: PublishedModelSource;
  /** Address migration records of a project in order, or null when that history cannot be read. */
  migrationRecords: (project: string) => MigrationRecord[] | null;
  now?: () => Date;
  flushIntervalMs?: number;
  warn?: (event: string, fields: Record<string, unknown>) => void;
};

/** Returns the counting rule of a request that should be counted, or undefined when it should not. */
export function rulesForRequest(input: Pick<UsageRecordInput, 'operationId' | 'origin' | 'surface' | 'outcome'> & { status: number }): CountedOperation | undefined {
  if (input.status < 200 || input.status >= 300) return undefined;
  if (input.surface === 'browser') return undefined;
  if (!(CALLER_ORIGINS as readonly string[]).includes(input.origin)) return undefined;
  if (!OPERATION_OUTCOMES.includes(input.outcome) || (input.outcome !== 'ok' && input.outcome !== 'degraded')) return undefined;
  return countedOperation(input.operationId);
}

type PendingDay = { file: CounterDayFile; size: number };

async function boundedAnswer(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return parts.join('') + decoder.decode();
      size += value.byteLength;
      if (size > MAX_COUNTED_RESPONSE_BYTES) {
        // A cloned stream's cancellation may wait for the caller's original stream to finish.
        void reader.cancel().catch(() => {});
        return null;
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}

/** Creates the recorder for settings that have counters on; off settings give the no-op recorder. */
export function createUsageRecorder(deps: UsageRecorderDeps): UsageRecorder {
  if (!deps.settings.enabled) return NO_USAGE_RECORDER;
  const now = deps.now ?? (() => new Date());
  const warn = deps.warn ?? ((event, fields) => log.warn(event, fields));
  const memory = new Map<string, Map<string, PendingDay>>();
  const inFlight = new Set<Promise<void>>();
  const lastWarned = new Map<string, number>();
  let closing: Promise<void> | undefined;
  let compactedOn = '';

  function warnOncePerHour(event: string, fields: Record<string, unknown> = {}) {
    const last = lastWarned.get(event) ?? Number.NEGATIVE_INFINITY;
    if (now().getTime() - last < WARNING_INTERVAL_MS) return;
    lastWarned.set(event, now().getTime());
    warn(event, fields);
  }

  function dayInMemory(project: string, day: string): PendingDay {
    const days = memory.get(project) ?? new Map<string, PendingDay>();
    memory.set(project, days);
    const existing = days.get(day) ?? { file: emptyDayFile(project, day), size: 0 };
    days.set(day, existing);
    return existing;
  }

  function increment(project: string, rule: CountedOperation, input: UsageRecordInput, addresses: string[]) {
    const day = dayInMemory(project, utcDay(now()));
    const { file } = day;
    for (const address of addresses) {
      if (!Object.hasOwn(file.counts, address)) {
        if (day.size >= MAX_ADDRESSES_PER_DAY) {
          file.other = Math.min(MAX_COUNT, (file.other ?? 0) + 1);
          continue;
        }
        day.size += 1;
      }
      addCount(file.counts, { address, measure: rule.measure, operation: input.operationId, origin: input.origin });
    }
  }

  async function count(rule: CountedOperation, input: UsageRecordInput, copy: Response, commit: string) {
    const text = await boundedAnswer(copy);
    if (text === null) return;
    const answer = JSON.parse(text);
    const project = answerProject(rule.items, answer, input.target);
    if (!project) return;
    const models = await deps.models(project, commit);
    if (!models) return;
    increment(project, rule, input, itemAddresses(rule.items, { answer, models, target: input.target }));
  }

  function record(input: UsageRecordInput) {
    if (closing || inFlight.size >= MAX_ACTIVE_RECORDINGS) return;
    try {
      const rule = rulesForRequest({ ...input, status: input.response.status });
      const commit = input.response.headers.get(SNAPSHOT_HEADER);
      const length = Number(input.response.headers.get('content-length') ?? 0);
      if (!rule || !commit || length > MAX_COUNTED_RESPONSE_BYTES) return;
      const task: Promise<void> = count(rule, input, input.response.clone(), commit)
        .catch(() => warnOncePerHour('usage.count-failed'))
        .finally(() => inFlight.delete(task));
      inFlight.add(task);
    } catch {
      warnOncePerHour('usage.count-failed');
    }
  }

  function flushDay(project: string, day: string, days: Map<string, PendingDay>) {
    const decision = decideFlush(deps.store.readDay(project, day), days.get(day)!.file, deps.migrationRecords(project));
    if (decision.action === 'keep-memory') return warnOncePerHour('usage.flush-deferred', { reason: decision.reason });
    deps.store.writeDay(decision.file);
    days.delete(day);
  }

  /** Expires old days and updates the addresses of the rest, once for each UTC day. */
  function compactOncePerDay() {
    const today = utcDay(now());
    if (today === compactedOn) return;
    compactedOn = today;
    try {
      compactUsage({ store: deps.store, today, retentionDays: deps.settings.retentionDays, migrationRecords: deps.migrationRecords });
    } catch {
      warnOncePerHour('usage.compaction-failed');
    }
  }

  function flush() {
    compactOncePerDay();
    for (const [project, days] of memory) {
      for (const day of days.keys()) {
        try {
          flushDay(project, day, days);
        } catch {
          warnOncePerHour('usage.flush-failed');
        }
      }
      if (!days.size) memory.delete(project);
    }
  }

  compactOncePerDay();
  const timer = setInterval(flush, deps.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS);
  timer.unref();

  return {
    enabled: true,
    record,
    pending: project => [...(memory.get(project)?.values() ?? [])].map(({ file }) => structuredClone(file)),
    settled: async () => {
      while (inFlight.size) await Promise.all(inFlight);
    },
    flush,
    close() {
      if (closing) return closing;
      clearInterval(timer);
      closing = Promise.resolve();
      if (inFlight.size) {
        closing = Promise.all(inFlight).then(flush);
      } else {
        flush();
      }
      return closing;
    },
  };
}
