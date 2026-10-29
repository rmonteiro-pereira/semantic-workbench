// The metrics the server records. Instruments come from the OpenTelemetry API, so they record
// nothing until telemetry registers a meter provider.
import { metrics, type Attributes } from '@opentelemetry/api';

const METER_NAME = 'semantic-workbench';

// Instruments made while no provider is registered do nothing forever, so they are kept only for
// the provider that made them and rebuilt when the registered provider changes.
let instruments: ReturnType<typeof createInstruments> | undefined;
let instrumentsProvider: unknown;

function createInstruments() {
  const meter = metrics.getMeter(METER_NAME);
  return {
    requests: meter.createCounter('sw.http.server.requests', {
      description: 'Handled HTTP requests by route template and status.',
    }),
    requestDuration: meter.createHistogram('sw.http.server.duration', {
      unit: 'ms',
      description: 'HTTP request duration by route template and status.',
    }),
    gitDuration: meter.createHistogram('sw.git.command.duration', {
      unit: 'ms',
      description: 'Git command duration by subcommand.',
    }),
    gitFailures: meter.createCounter('sw.git.command.failures', {
      description: 'Git commands that failed, timed out or were cancelled.',
    }),
    scanDuration: meter.createHistogram('sw.workspace.scan.duration', {
      unit: 'ms',
      description: 'Duration of a project scan that reindexes its files.',
    }),
    validationDuration: meter.createHistogram('sw.validation.duration', {
      unit: 'ms',
      description: 'Duration of validating one document.',
    }),
    streams: meter.createUpDownCounter('sw.sse.active_streams', {
      description: 'Event streams currently open.',
    }),
    authFailures: meter.createCounter('sw.auth.failures', {
      description: 'Refused sign-ins, tokens and sessions by reason.',
    }),
    browserErrors: meter.createCounter('sw.browser.errors', {
      description: 'JavaScript errors and unhandled rejections reported by browsers.',
    }),
    browserOperation: meter.createHistogram('sw.browser.operation.duration', {
      unit: 'ms',
      description: 'Browser-measured duration of page load, layout, validation and save.',
    }),
    browserOverBudget: meter.createCounter('sw.browser.over_budget', {
      description: 'Browser operations slower than their budget.',
    }),
  };
}

function use() {
  const provider = metrics.getMeterProvider();
  if (!instruments || provider !== instrumentsProvider) {
    instruments = createInstruments();
    instrumentsProvider = provider;
  }
  return instruments;
}

/** Forgets the instruments, so the next use binds them to the current meter provider. */
export function resetMetrics(): void {
  instruments = undefined;
  instrumentsProvider = undefined;
}

/** Records one finished HTTP request. */
export function recordRequest(route: string, method: string, status: number, durationMs: number) {
  const attributes: Attributes = { route, method, status };
  use().requests.add(1, attributes);
  use().requestDuration.record(durationMs, attributes);
}

/** Records one finished Git command; a failure also counts. */
export function recordGitCommand(subcommand: string, durationMs: number, failed: boolean) {
  use().gitDuration.record(durationMs, { subcommand, failed });
  if (failed) use().gitFailures.add(1, { subcommand });
}

/** Records how long a project scan took. */
export function recordScan(durationMs: number) {
  use().scanDuration.record(durationMs);
}

/** Records how long validating one document took, and why it was validated. */
export function recordValidation(trigger: 'scan' | 'save', durationMs: number) {
  use().validationDuration.record(durationMs, { trigger });
}

/** Counts an event stream opening (+1) or closing (-1). */
export function recordStreamChange(change: 1 | -1) {
  use().streams.add(change);
}

/** Counts a refused sign-in, token or session. */
export function recordAuthFailure(reason: string) {
  use().authFailures.add(1, { reason });
}

/** Counts one browser error report. */
export function recordBrowserError(kind: string) {
  use().browserErrors.add(1, { kind });
}

/** Records one browser-measured operation and whether it was over its budget. */
export function recordBrowserOperation(operation: string, durationMs: number, overBudget: boolean) {
  use().browserOperation.record(durationMs, { operation });
  if (overBudget) use().browserOverBudget.add(1, { operation });
}
