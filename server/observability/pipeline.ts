// Builds the OpenTelemetry SDK pieces and registers them globally. Imported only when telemetry
// is on; see telemetry.ts.
import { context, metrics, trace } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type { StartOptions, TelemetryBackends } from './telemetry';

const DEFAULT_METRIC_INTERVAL_MS = 60_000;

/** Resource attributes: the service, its build and mode, and nothing about people. */
export function resourceAttributes(service: StartOptions['service']) {
  return {
    'service.name': 'semantic-workbench',
    'service.version': service.version ?? 'unknown',
    'service.instance.id': service.revision ?? 'unknown',
    'sw.commit': service.commit ?? 'unknown',
    'sw.mode': service.mode,
  };
}

/** Creates the three providers, registers them with the API and returns their shutdown. */
export async function createPipeline(
  options: Pick<StartOptions, 'service' | 'metricIntervalMs'> & { backends: TelemetryBackends },
): Promise<{ shutdown(): Promise<void> }> {
  const { backends } = options;
  const resource = resourceFromAttributes(resourceAttributes(options.service));
  const contextManager = new AsyncLocalStorageContextManager().enable();
  context.setGlobalContextManager(contextManager);
  const tracerProvider = new BasicTracerProvider({
    resource,
    sampler: backends.sampler,
    spanProcessors: [new BatchSpanProcessor(backends.spanExporter)],
  });
  const meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: backends.metricExporter,
        exportIntervalMillis: options.metricIntervalMs ?? DEFAULT_METRIC_INTERVAL_MS,
      }),
    ],
  });
  const loggerProvider = new LoggerProvider({ resource });
  loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(backends.logExporter));
  trace.setGlobalTracerProvider(tracerProvider);
  metrics.setGlobalMeterProvider(meterProvider);
  logs.setGlobalLoggerProvider(loggerProvider);
  return {
    async shutdown() {
      await Promise.allSettled([
        tracerProvider.shutdown(),
        meterProvider.shutdown(),
        loggerProvider.shutdown(),
      ]);
    },
  };
}
