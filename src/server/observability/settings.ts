// Reads the logging and telemetry settings from the environment. Telemetry is off unless the
// server runs in server mode and holds a valid Application Insights connection string.

type Env = Record<string, string | undefined>;
type Problem = { variable: string; message: string };

/** Log severities, from most to least verbose; "silent" turns the logger off. */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;

/** One severity from {@link LOG_LEVELS}. */
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Why exported telemetry is switched off. */
export type TelemetryOffReason = 'local-mode' | 'no-connection-string';

/** Exported telemetry is either off, with the reason, or fully described. */
export type TelemetrySettings = { enabled: false; reason: TelemetryOffReason } | { enabled: true; connectionString: string; sampleRatio: number };

/** What the logger and the telemetry pipeline need from the environment. */
export type ObservabilitySettings = {
  logLevel: LogLevel;
  /** JSON lines for a server that a platform collects, readable lines for a developer. */
  logFormat: 'json' | 'text';
  /** Secret mixed into the pseudonym of each person; null makes a new one at every start. */
  actorSalt: string | null;
  telemetry: TelemetrySettings;
};

/** Default share of traces kept; metrics and error logs are never sampled. */
export const DEFAULT_SAMPLE_RATIO = 0.1;

// The connection string names where data is sent, so only Microsoft's own ingestion hosts are
// accepted. A typo or a swapped value then cannot send operational data to another party.
const INGESTION_HOST_SUFFIXES = ['.applicationinsights.azure.com', '.applicationinsights.azure.cn', '.applicationinsights.azure.us', '.in.ai.monitor.azure.com'];
const GLOBAL_INGESTION_HOST = 'dc.services.visualstudio.com';
const INSTRUMENTATION_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads every logging and telemetry variable, adding one problem per invalid value. */
export function readObservability(env: Env, serverMode: boolean, problems: Problem[]): ObservabilitySettings {
  return {
    logLevel: readLogLevel(env.SW_LOG_LEVEL, problems),
    logFormat: serverMode ? 'json' : 'text',
    actorSalt: env.SW_TELEMETRY_ACTOR_SALT?.trim() || null,
    telemetry: readTelemetry(env, serverMode, problems),
  };
}

function readLogLevel(value: string | undefined, problems: Problem[]): LogLevel {
  const text = value?.trim().toLowerCase() ?? '';
  if (text === '') return 'info';
  if ((LOG_LEVELS as readonly string[]).includes(text)) return text as LogLevel;
  problems.push({
    variable: 'SW_LOG_LEVEL',
    message: `must be one of ${LOG_LEVELS.join(', ')}.`,
  });
  return 'info';
}

/**
 * Local mode never exports, whatever the environment holds, because it must make no network
 * call. Server mode exports only when a connection string is set.
 */
export function readTelemetry(env: Env, serverMode: boolean, problems: Problem[]): TelemetrySettings {
  if (!serverMode) return { enabled: false, reason: 'local-mode' };
  const connectionString = env.APPLICATIONINSIGHTS_CONNECTION_STRING?.trim() ?? '';
  if (connectionString === '') return { enabled: false, reason: 'no-connection-string' };
  const sampleRatio = readSampleRatio(env.SW_TRACE_SAMPLE_RATIO, problems);
  const message = connectionStringProblem(connectionString);
  if (message) {
    problems.push({ variable: 'APPLICATIONINSIGHTS_CONNECTION_STRING', message });
  }
  return { enabled: true, connectionString, sampleRatio };
}

function readSampleRatio(value: string | undefined, problems: Problem[]): number {
  const text = value?.trim() ?? '';
  if (text === '') return DEFAULT_SAMPLE_RATIO;
  const ratio = Number(text);
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    problems.push({
      variable: 'SW_TRACE_SAMPLE_RATIO',
      message: 'must be a number from 0 (no traces) to 1 (every trace).',
    });
    return DEFAULT_SAMPLE_RATIO;
  }
  return ratio;
}

/** Describes what is wrong with a connection string without repeating any part of it. */
export function connectionStringProblem(connectionString: string): string | null {
  const parts = new Map<string, string>();
  for (const segment of connectionString.split(';')) {
    const separator = segment.indexOf('=');
    if (separator > 0) parts.set(segment.slice(0, separator).trim(), segment.slice(separator + 1));
  }
  if (!INSTRUMENTATION_KEY.test(parts.get('InstrumentationKey') ?? '')) {
    return 'must hold an InstrumentationKey=<guid> entry.';
  }
  const endpoint = parts.get('IngestionEndpoint');
  if (endpoint === undefined) return null;
  return ingestionEndpointProblem(endpoint);
}

function ingestionEndpointProblem(endpoint: string): string | null {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return 'IngestionEndpoint must be a valid https:// address.';
  }
  const host = url.hostname.toLowerCase();
  const known = host === GLOBAL_INGESTION_HOST || INGESTION_HOST_SUFFIXES.some(s => host.endsWith(s));
  if (url.protocol !== 'https:' || !known) {
    return 'IngestionEndpoint must be an https:// Application Insights ingestion address.';
  }
  return null;
}
