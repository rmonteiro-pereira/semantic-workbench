// Builds the Azure Monitor exporters. Imported only when telemetry is on.
import type { TelemetryBackends } from './telemetry';
import type { TelemetrySettings } from './settings';

/**
 * Stops the exporter's own usage reporting to Microsoft ("Statsbeat"), which would otherwise
 * contact a Microsoft endpoint and the cloud metadata address at start-up. The only place data
 * may go is the operator's own Application Insights resource.
 */
function disableExporterUsageReporting(): void {
  process.env.APPLICATION_INSIGHTS_NO_STATSBEAT = 'true';
  process.env.APPLICATIONINSIGHTS_STATSBEAT_DISABLED = 'true';
}

/** Exporters for traces, metrics and logs, and the Application Insights trace sampler. */
export async function azureBackends(
  settings: Extract<TelemetrySettings, { enabled: true }>,
): Promise<TelemetryBackends> {
  disableExporterUsageReporting();
  const azure = await import('@azure/monitor-opentelemetry-exporter');
  const options = { connectionString: settings.connectionString };
  return {
    spanExporter: new azure.AzureMonitorTraceExporter(options),
    metricExporter: new azure.AzureMonitorMetricExporter(options),
    logExporter: new azure.AzureMonitorLogExporter(options),
    sampler: new azure.ApplicationInsightsSampler(settings.sampleRatio),
  };
}
