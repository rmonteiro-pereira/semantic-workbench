// The one logger of the server: structured events with a level, redacted fields, the id of the
// current request and, when telemetry is on, the trace and span ids. Audit records are a separate
// security log and do not pass through here.
import { trace } from '@opentelemetry/api';
import { describeError, redactFields, type SafeValue } from './redaction';
import { currentRequest } from './request-context';
import type { LogLevel } from './settings';

export type { LogLevel } from './settings';

/** Fields a caller may attach to an event; they are redacted before anything is written. */
export type LogFields = Record<string, unknown>;

/** One event after redaction, as the writers and the telemetry bridge receive it. */
export type LogRecord = {
  time: string;
  level: Exclude<LogLevel, 'silent'>;
  event: string;
  fields: Record<string, SafeValue>;
};

/** Receives each record that passed the level filter, for example the OpenTelemetry bridge. */
export type LogSink = (record: LogRecord) => void;

/** The logging calls available to the rest of the server. */
export type Logger = {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  /** Logs a failure with its name and redacted message, never its stack. */
  failure(event: string, error: unknown, fields?: LogFields): void;
};

/** How a logger writes and what it adds to every record. */
export type LoggerOptions = {
  level: LogLevel;
  format: 'json' | 'text';
  /** Writes one finished line; defaults to the console so test spies keep working. */
  write?: (line: string, level: LogRecord['level']) => void;
  clock?: () => Date;
};

const SEVERITY: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

function defaultWrite(line: string, level: LogRecord['level']): void {
  if (level === 'warn' || level === 'error') console.error(line);
  else console.log(line);
}

/** The request and trace identifiers of the code that is running now. */
function ambientFields(): Record<string, string> {
  const fields: Record<string, string> = {};
  const request = currentRequest();
  if (request) {
    fields.requestId = request.requestId;
    if (request.actor) fields.actor = request.actor;
  }
  const span = trace.getActiveSpan()?.spanContext();
  if (span && trace.isSpanContextValid(span)) {
    fields.traceId = span.traceId;
    fields.spanId = span.spanId;
  }
  return fields;
}

/** Formats a record as one JSON object or one readable line. */
export function formatRecord(record: LogRecord, format: 'json' | 'text'): string {
  if (format === 'json') {
    return JSON.stringify({
      time: record.time,
      level: record.level,
      event: record.event,
      ...record.fields,
    });
  }
  const time = record.time.slice(11, 19);
  const pairs = Object.entries(record.fields).map(([key, value]) => `${key}=${printable(value)}`);
  return [time, record.level.toUpperCase().padEnd(5), record.event, ...pairs].join(' ');
}

function printable(value: SafeValue): string {
  if (typeof value === 'string') return /[\s"=]/.test(value) ? JSON.stringify(value) : value;
  return JSON.stringify(value);
}

/** Builds a logger; the sink list is shared so a bridge added later reaches existing loggers. */
export function createLogger(options: LoggerOptions, sinks: LogSink[] = []): Logger {
  const write = options.write ?? defaultWrite;
  const clock = options.clock ?? (() => new Date());
  const threshold = SEVERITY[options.level];
  function emit(level: LogRecord['level'], event: string, fields: LogFields = {}): void {
    if (SEVERITY[level] < threshold) return;
    const record: LogRecord = {
      time: clock().toISOString(),
      level,
      event,
      fields: redactFields({ ...ambientFields(), ...fields }),
    };
    write(formatRecord(record, options.format), level);
    for (const sink of sinks) sink(record);
  }
  return {
    debug: (event, fields) => emit('debug', event, fields),
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
    failure: (event, error, fields) => emit('error', event, { ...fields, ...describeError(error) }),
  };
}

const sinks: LogSink[] = [];
let current: Logger = createLogger({ level: 'info', format: 'text' }, sinks);

/**
 * The server's logger. Every call goes to whichever logger start-up configured, so modules can
 * import this once and still follow `configureLogging`.
 */
export const log: Logger = {
  debug: (event, fields) => current.debug(event, fields),
  info: (event, fields) => current.info(event, fields),
  warn: (event, fields) => current.warn(event, fields),
  error: (event, fields) => current.error(event, fields),
  failure: (event, error, fields) => current.failure(event, error, fields),
};

/** Chooses the level and format once, at start-up. */
export function configureLogging(options: LoggerOptions): void {
  current = createLogger(options, sinks);
}

/** Adds a receiver of every logged record; returns the function that removes it. */
export function addLogSink(sink: LogSink): () => void {
  sinks.push(sink);
  return () => {
    const index = sinks.indexOf(sink);
    if (index >= 0) sinks.splice(index, 1);
  };
}
