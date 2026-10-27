// The shape, limits and checks of the error and performance reports a browser sends to the API.
// Browser and server import this one file, so what the browser builds is what the server accepts.

/** Most reports in one request. */
export const MAX_REPORTS_PER_REQUEST = 20;
/**
 * Largest request body the API reads, in bytes. A full batch of reports that each use every
 * allowed character is about 27 KiB, so this admits any valid batch of plain text.
 */
export const MAX_REPORT_BODY_BYTES = 32 * 1024;
/** Longest error message kept, in characters. */
export const MAX_MESSAGE_LENGTH = 200;
/** Longest error name kept, in characters. */
export const MAX_NAME_LENGTH = 80;
/** Longest stack excerpt kept, in characters. */
export const MAX_FRAMES_LENGTH = 1000;
/** Longest duration accepted, in milliseconds: one hour. */
export const MAX_DURATION_MS = 3_600_000;

/** The operations whose duration is reported. */
export const REPORTED_OPERATIONS = ['page-load', 'graph-layout', 'validation', 'save'] as const;

/** One operation from {@link REPORTED_OPERATIONS}. */
export type ReportedOperation = (typeof REPORTED_OPERATIONS)[number];

/**
 * How long each operation may take before it counts as slow, in milliseconds. These are the
 * budgets the project already holds itself to: findings within 500 ms of a typing pause, a first
 * graph view within 2 s, and a save visible to every open tab within 2 s. A page load has no
 * budget; it is reported as it was measured.
 */
export const OPERATION_BUDGETS_MS: Record<ReportedOperation, number | null> = {
  'page-load': null,
  'graph-layout': 2000,
  validation: 500,
  save: 2000,
};

/** A script error or a promise rejection nobody handled. */
export type ErrorReport = {
  kind: 'error' | 'unhandled-rejection';
  name: string;
  message: string;
  /** The top frames of the stack: script addresses and positions, never file content. */
  frames?: string;
};

/** The measured duration of one operation. */
export type OperationReport = {
  kind: 'operation';
  operation: ReportedOperation;
  durationMs: number;
};

/** One report. */
export type BrowserReport = ErrorReport | OperationReport;

/** The request body of the report route. */
export type BrowserReportBatch = { reports: BrowserReport[] };

/** Either the reports of a valid body or a message for the caller. */
export type ReportCheck = { ok: true; reports: BrowserReport[] } | { ok: false; error: string };

const QUOTED_TEXT = /"[^"]*"|'[^']*'|`[^`]*`/g;
const ERROR_KEYS = ['kind', 'name', 'message', 'frames'];
const OPERATION_KEYS = ['kind', 'operation', 'durationMs'];

/**
 * Shortens a message and replaces anything quoted in it. Parser errors often quote the input they
 * choked on, which can be a piece of someone's document.
 */
export function scrubErrorMessage(message: string): string {
  return message.replace(QUOTED_TEXT, '"…"').slice(0, MAX_MESSAGE_LENGTH);
}

/** Checks a request body strictly: unknown fields, wrong types and oversized values are refused. */
export function checkReportBatch(body: unknown): ReportCheck {
  if (!isRecord(body) || Object.keys(body).length !== 1 || !Array.isArray(body.reports)) {
    return { ok: false, error: 'Expected { reports: [...] }.' };
  }
  if (body.reports.length === 0 || body.reports.length > MAX_REPORTS_PER_REQUEST) {
    return { ok: false, error: `Send 1 to ${MAX_REPORTS_PER_REQUEST} reports.` };
  }
  const reports: BrowserReport[] = [];
  for (const candidate of body.reports) {
    const report = checkReport(candidate);
    if (typeof report === 'string') return { ok: false, error: report };
    reports.push(report);
  }
  return { ok: true, reports };
}

function checkReport(candidate: unknown): BrowserReport | string {
  if (!isRecord(candidate)) return 'A report must be an object.';
  if (candidate.kind === 'error' || candidate.kind === 'unhandled-rejection') {
    return checkErrorReport(candidate);
  }
  if (candidate.kind === 'operation') return checkOperationReport(candidate);
  return 'Unknown report kind.';
}

function checkErrorReport(candidate: Record<string, unknown>): ErrorReport | string {
  if (!onlyKeys(candidate, ERROR_KEYS)) return 'An error report has unknown fields.';
  const { kind, name, message, frames } = candidate;
  if (!boundedText(name, MAX_NAME_LENGTH)) return 'Error name is missing or too long.';
  if (!boundedText(message, MAX_MESSAGE_LENGTH)) return 'Error message is missing or too long.';
  if (frames !== undefined && !boundedText(frames, MAX_FRAMES_LENGTH, true)) {
    return 'Error frames are too long.';
  }
  return {
    kind: kind as ErrorReport['kind'],
    name: name as string,
    message: message as string,
    ...(frames === undefined ? {} : { frames: frames as string }),
  };
}

function checkOperationReport(candidate: Record<string, unknown>): OperationReport | string {
  if (!onlyKeys(candidate, OPERATION_KEYS)) return 'An operation report has unknown fields.';
  const { operation, durationMs } = candidate;
  if (!REPORTED_OPERATIONS.includes(operation as ReportedOperation)) {
    return 'Unknown operation.';
  }
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) {
    return 'Duration must be a number.';
  }
  if (durationMs < 0 || durationMs > MAX_DURATION_MS) return 'Duration is out of range.';
  return { kind: 'operation', operation: operation as ReportedOperation, durationMs };
}

/** True when a measured duration is over the operation's budget. */
export function isOverBudget(operation: ReportedOperation, durationMs: number): boolean {
  const budget = OPERATION_BUDGETS_MS[operation];
  return budget !== null && durationMs > budget;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function onlyKeys(record: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(record).every(key => allowed.includes(key));
}

function boundedText(value: unknown, maxLength: number, allowEmpty = false): boolean {
  if (typeof value !== 'string') return false;
  return value.length <= maxLength && (allowEmpty || value.length > 0);
}
