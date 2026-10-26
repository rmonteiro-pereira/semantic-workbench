// Starts and stops exported telemetry. Nothing in the OpenTelemetry SDK or the Azure Monitor
// exporter is loaded unless the settings say telemetry is on, so the off path opens no connection.
import { context, diag, DiagLogLevel, metrics, trace } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { addLogSink, log, type LogRecord } from './log';
import { resetMetrics } from './metrics';
import type { TelemetrySettings } from './settings';

/** The build and mode that every exported record is labelled with. */
export type ServiceIdentity = {
  version: string | null;
  commit: string | null;
  mode: 'local' | 'server';
  /** Container Apps revision; tells instances apart during a hand-over. */
  revision: string | null;
};

/** The pieces a telemetry run needs, so tests can supply in-memory ones. */
export type TelemetryBackends = {
  spanExporter: import('@opentelemetry/sdk-trace-base').SpanExporter;
  metricExporter: import('@opentelemetry/sdk-metrics').PushMetricExporter;
  logExporter: import('@opentelemetry/sdk-logs').LogRecordExporter;
  /** Decides which traces are kept. */
  sampler: import('@opentelemetry/sdk-trace-base').Sampler;
};

/** Builds the backends; the default sends to Application Insights. */
export type BackendFactory = (
  settings: Extract<TelemetrySettings, { enabled: true }>,
) => Promise<TelemetryBackends>;

/** A running (or declined) telemetry pipeline. */
export type Telemetry = {
  status: TelemetryStatus;
  /** Flushes what is queued and stops exporting. Safe to call when telemetry is off. */
  shutdown(): Promise<void>;
};

/** What `/healthz` may say about telemetry: whether it is on, never where it sends. */
export type TelemetryStatus =
  | { enabled: false; reason: string }
  | { enabled: true; sampleRatio: number };

/** Options of {@link startTelemetry}. */
export type StartOptions = {
  settings: TelemetrySettings;
  service: ServiceIdentity;
  /** Replaces the Application Insights exporters; used by tests. */
  backends?: BackendFactory;
  /** Interval between metric exports, in milliseconds. */
  metricIntervalMs?: number;
};

const OFF_SHUTDOWN = async () => {};
const SHUTDOWN_TIMEOUT_MS = 5000;

const SEVERITY: Record<LogRecord['level'], SeverityNumber> = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

/** Starts telemetry when the settings turn it on; otherwise loads nothing and returns at once. */
export async function startTelemetry(options: StartOptions): Promise<Telemetry> {
  const { settings } = options;
  if (!settings.enabled) {
    return { status: { enabled: false, reason: settings.reason }, shutdown: OFF_SHUTDOWN };
  }
  // The SDK is imported here and nowhere else, so a server with telemetry off never loads it.
  const { createPipeline } = await import('./pipeline');
  const { azureBackends } = await import('./azure-backends');
  const backends = await (options.backends ?? azureBackends)(settings);
  const pipeline = await createPipeline({ ...options, backends });
  const removeSink = addLogSink(record => bridgeRecord(record));
  reportExportProblems();
  log.info('telemetry.started', { sampleRatio: settings.sampleRatio });
  async function shutdown() {
    removeSink();
    await withTimeout(pipeline.shutdown());
    diag.disable();
    trace.disable();
    metrics.disable();
    logs.disable();
    context.disable();
    resetMetrics();
  }
  return { status: { enabled: true, sampleRatio: settings.sampleRatio }, shutdown };
}

/**
 * The only log fields that leave the server. Stdout lines may carry more (a project name, a
 * client address, Git's own error text), but redaction by name cannot promise that every field a
 * future log call adds is free of names and identifiers, so export is an allow-list.
 */
export const EXPORTED_FIELDS: ReadonlySet<string> = new Set([
  'requestId',
  'traceId',
  'spanId',
  'actor',
  'route',
  'method',
  'status',
  'durationMs',
  'errorName',
  'kind',
  'operation',
  'budgetMs',
  'subcommand',
  'reason',
  'refused',
  'repositories',
  'sampleRatio',
]);

/** Keeps only the allow-listed fields of a record. */
export function exportableFields(fields: LogRecord['fields']): LogRecord['fields'] {
  return Object.fromEntries(Object.entries(fields).filter(([name]) => EXPORTED_FIELDS.has(name)));
}

function bridgeRecord(record: LogRecord): void {
  logs.getLogger('semantic-workbench').emit({
    severityNumber: SEVERITY[record.level],
    severityText: record.level.toUpperCase(),
    body: record.event,
    attributes: exportableFields(record.fields),
    timestamp: new Date(record.time),
  });
}

// Export problems (a wrong key, a blocked network) would otherwise be silent. They go to stdout
// only: `detail` is not an exported field, because the SDK's messages can quote the endpoint.
function reportExportProblems(): void {
  const forward = (message: string) => log.warn('telemetry.export-problem', { detail: message });
  diag.setLogger(
    {
      error: forward,
      warn: forward,
      info: () => {},
      debug: () => {},
      verbose: () => {},
    },
    DiagLogLevel.WARN,
  );
}

async function withTimeout(work: Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<void>(resolve => {
    timer = setTimeout(resolve, SHUTDOWN_TIMEOUT_MS);
  });
  try {
    await Promise.race([
      work.catch(error => log.failure('telemetry.shutdown-failed', error)),
      expired.then(() => log.warn('telemetry.shutdown-timed-out')),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
