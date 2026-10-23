// Turns checked browser reports into log events and metrics. The browser only sends errors and
// timings; here they are re-scrubbed, because the server must not trust what a browser says.
import {
  isOverBudget,
  OPERATION_BUDGETS_MS,
  scrubErrorMessage,
  type BrowserReport,
} from '../../src/observability/browser-report';
import { log } from './log';
import { recordBrowserError, recordBrowserOperation } from './metrics';

/** Records each report; the caller has already checked them against the report schema. */
export function recordBrowserReports(reports: BrowserReport[]): void {
  for (const report of reports) {
    if (report.kind === 'operation') recordOperation(report);
    else recordError(report);
  }
}

function recordError(report: Extract<BrowserReport, { kind: 'error' | 'unhandled-rejection' }>) {
  recordBrowserError(report.kind);
  log.warn('browser.error', {
    kind: report.kind,
    errorName: report.name,
    errorMessage: scrubErrorMessage(report.message),
    frames: report.frames,
  });
}

function recordOperation(report: Extract<BrowserReport, { kind: 'operation' }>) {
  const { operation, durationMs } = report;
  const overBudget = isOverBudget(operation, durationMs);
  recordBrowserOperation(operation, durationMs, overBudget);
  if (!overBudget) return;
  log.warn('browser.slow-operation', {
    operation,
    durationMs,
    budgetMs: OPERATION_BUDGETS_MS[operation],
  });
}
