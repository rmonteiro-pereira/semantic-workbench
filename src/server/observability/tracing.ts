// Starts spans through the OpenTelemetry API. Without a registered SDK the API hands out spans
// that do nothing, so instrumented code costs almost nothing and opens no connection when
// telemetry is off.
import { SpanKind, SpanStatusCode, trace, type Attributes, type Span } from '@opentelemetry/api';
import { describeError } from './redaction';

const TRACER_NAME = 'semantic-workbench';

/** What a span needs besides its name. */
export type SpanOptions = { attributes?: Attributes; kind?: SpanKind };

function markFailed(span: Span, error: unknown): void {
  // Only the error's name is exported: its message can hold file names or remote addresses.
  const { errorName } = describeError(error);
  span.setAttribute('error.type', errorName);
  span.setStatus({ code: SpanStatusCode.ERROR, message: errorName });
}

function startOptions(options: SpanOptions) {
  return { attributes: options.attributes, kind: options.kind ?? SpanKind.INTERNAL };
}

/**
 * Runs work inside a span that ends when the work does. A thrown error marks the span failed
 * with its name and redacted message, and is thrown again unchanged.
 */
export async function withSpan<T>(
  name: string,
  options: SpanOptions,
  work: (span: Span) => Promise<T> | T,
): Promise<T> {
  const tracer = trace.getTracer(TRACER_NAME);
  return tracer.startActiveSpan(name, startOptions(options), async span => {
    try {
      return await work(span);
    } catch (error) {
      markFailed(span, error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/** Like {@link withSpan} for work that finishes without waiting. */
export function withSpanSync<T>(name: string, options: SpanOptions, work: (span: Span) => T): T {
  const tracer = trace.getTracer(TRACER_NAME);
  return tracer.startActiveSpan(name, startOptions(options), span => {
    try {
      return work(span);
    } catch (error) {
      markFailed(span, error);
      throw error;
    } finally {
      span.end();
    }
  });
}

export { SpanKind };
