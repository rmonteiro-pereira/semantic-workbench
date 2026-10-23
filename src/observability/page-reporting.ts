// Connects the reporter to the page: error listeners, the page-load timing, the report sender and
// the server's answer about whether reports are wanted. Nothing here records clicks, keystrokes
// or document text, and nothing calls a host other than the workbench API.
import { apiFetch } from '../projects/api';
import { loadIdentity } from '../auth/useMe';
import type { BrowserReport, ReportedOperation } from './browser-report';
import { createReporter, type Reporter } from './reporter';

/** The path of the report route. */
const REPORT_PATH = '/api/telemetry/browser';

async function sendReports(reports: BrowserReport[]): Promise<number> {
  const response = await apiFetch(REPORT_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reports }),
    keepalive: true,
  });
  return response.status;
}

/** The page's one reporter. */
export const browserReporter: Reporter = createReporter({ send: sendReports });

/**
 * Times a promise and reports it if it was slow. The promise itself passes through unchanged,
 * so wrapping an operation never changes its result or its failure.
 */
export function timeOperation<T>(operation: ReportedOperation, work: Promise<T>): Promise<T> {
  const started = performance.now();
  const finish = () => browserReporter.reportOperation(operation, performance.now() - started);
  work.then(finish, finish);
  return work;
}

function reportPageLoad(): void {
  const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  if (navigation) browserReporter.reportOperation('page-load', navigation.loadEventEnd);
}

/**
 * Starts collecting errors and timings. Reports wait in memory until the server's identity answer
 * says reporting is on; otherwise they are discarded and nothing is ever sent.
 */
export function startBrowserReporting(target: Window = window): void {
  target.addEventListener('error', event => {
    browserReporter.reportError('error', event.error ?? new Error(event.message));
  });
  target.addEventListener('unhandledrejection', event => {
    browserReporter.reportError('unhandled-rejection', event.reason);
  });
  if (document.readyState === 'complete') reportPageLoadSoon();
  else target.addEventListener('load', reportPageLoadSoon, { once: true });
  loadIdentity().then(
    me => (me.telemetry?.browserReports ? browserReporter.enable() : browserReporter.disable()),
    () => browserReporter.disable(),
  );
}

// loadEventEnd is zero until the load handlers finish, so the timing is read on the next tick.
function reportPageLoadSoon(): void {
  setTimeout(reportPageLoad, 0);
}
