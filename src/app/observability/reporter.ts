// Collects error and timing reports in the browser and hands them to a sender in small batches.
// It holds nothing back for later: reports wait in memory only until the server says whether
// reporting is on, and a failed send drops its batch instead of retrying.
import { MAX_FRAMES_LENGTH, MAX_NAME_LENGTH, MAX_REPORTS_PER_REQUEST, isOverBudget, scrubErrorMessage, type BrowserReport, type ReportedOperation } from '../../shared/observability/browser-report';

/** Sends one batch; resolves with the HTTP status, or rejects when the network failed. */
export type ReportSender = (reports: BrowserReport[]) => Promise<number>;

/** Limits that keep a misbehaving page from flooding the API. */
export type ReporterLimits = {
  /** Reports kept while waiting for the server's answer or the next batch. */
  queued: number;
  /** Reports sent in one page session. */
  perSession: number;
  /** Shortest time between two slow-operation reports of the same operation, in ms. */
  slowOperationGapMs: number;
  /** Time before a non-empty queue is sent, in ms. */
  batchDelayMs: number;
};

/** Defaults: small enough that one page is a trickle for the server. */
export const DEFAULT_REPORTER_LIMITS: ReporterLimits = {
  queued: 50,
  perSession: 100,
  slowOperationGapMs: 10_000,
  batchDelayMs: 3000,
};

/** Dependencies of a reporter, replaced in tests. */
export type ReporterOptions = {
  send: ReportSender;
  now?: () => number;
  /** Starts a timer; defaults to setTimeout. */
  schedule?: (work: () => void, delayMs: number) => void;
  limits?: ReporterLimits;
};

type Mode = 'waiting' | 'on' | 'off';

/** Collects reports and sends them once the server has switched reporting on. */
export function createReporter(options: ReporterOptions) {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((work, delay) => void setTimeout(work, delay));
  const limits = options.limits ?? DEFAULT_REPORTER_LIMITS;
  let mode: Mode = 'waiting';
  let queue: BrowserReport[] = [];
  let sent = 0;
  let flushScheduled = false;
  const seenErrors = new Set<string>();
  const lastSlow = new Map<ReportedOperation, number>();

  function accept(report: BrowserReport): void {
    if (mode === 'off' || sent + queue.length >= limits.perSession) return;
    if (queue.length >= limits.queued) return;
    queue.push(report);
    if (mode === 'on') scheduleFlush();
  }

  function scheduleFlush(): void {
    if (flushScheduled) return;
    flushScheduled = true;
    schedule(() => void flush(), limits.batchDelayMs);
  }

  async function flush(): Promise<void> {
    flushScheduled = false;
    if (mode !== 'on' || queue.length === 0) return;
    const batch = queue.slice(0, MAX_REPORTS_PER_REQUEST);
    queue = queue.slice(batch.length);
    sent += batch.length;
    try {
      const status = await options.send(batch);
      // A refusal means the server does not want reports; stop instead of asking again.
      if (status === 404 || status === 401 || status === 403) mode = 'off';
    } catch {
      // A network failure drops the batch: error reporting must never add load to a sick page.
    }
    if (queue.length > 0 && mode === 'on') scheduleFlush();
  }

  return {
    /** Records a script error or an unhandled rejection; the same one is sent once per page. */
    reportError(kind: 'error' | 'unhandled-rejection', error: unknown): void {
      const name = (error instanceof Error ? error.name : 'Error').slice(0, MAX_NAME_LENGTH);
      const message = scrubErrorMessage(error instanceof Error ? error.message : String(error));
      const identity = `${kind}|${name}|${message}`;
      if (seenErrors.has(identity) || seenErrors.size >= limits.queued) return;
      seenErrors.add(identity);
      const frames = error instanceof Error ? topFrames(error.stack) : undefined;
      accept({ kind, name, message: message || name, ...(frames ? { frames } : {}) });
    },
    /** Records how long an operation took; only slow ones and page loads are kept. */
    reportOperation(operation: ReportedOperation, durationMs: number): void {
      const slow = isOverBudget(operation, durationMs);
      if (operation !== 'page-load' && !slow) return;
      const last = lastSlow.get(operation);
      if (last !== undefined && now() - last < limits.slowOperationGapMs) return;
      lastSlow.set(operation, now());
      accept({ kind: 'operation', operation, durationMs: Math.round(durationMs) });
    },
    /** The server accepts reports: send what waited. */
    enable(): void {
      if (mode !== 'waiting') return;
      mode = 'on';
      if (queue.length > 0) scheduleFlush();
    },
    /** The server does not take reports (local mode, telemetry off): forget everything. */
    disable(): void {
      mode = 'off';
      queue = [];
    },
    /** Sends what is queued now; for tests and page hide. */
    flush,
    /** How many reports wait. */
    get queued(): number {
      return queue.length;
    },
  };
}

/** A reporter, as the rest of the browser code uses it. */
export type Reporter = ReturnType<typeof createReporter>;

// A stack frame is "at name (address:line:column)" in Chromium and "name@address:line:column" in
// Firefox and Safari. Any other line is the error's own text, which can quote a document.
const STACK_FRAME = /^\s*at\s|@\S+:\d+:\d+$/;
const MAX_FRAMES = 5;

/** Keeps the first stack frames, which name script positions, and never the message line. */
export function topFrames(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const frames = stack.split('\n').filter(line => STACK_FRAME.test(line));
  return frames.slice(0, MAX_FRAMES).join('\n').slice(0, MAX_FRAMES_LENGTH) || undefined;
}
