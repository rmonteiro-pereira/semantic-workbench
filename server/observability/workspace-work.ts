// Measures the workspace's own work: scanning and reindexing a project, and validating documents.
// Project names and file paths are not recorded; only counts and durations are.
import { recordScan, recordValidation } from './metrics';
import { withSpan, withSpanSync } from './tracing';

/** What a finished scan found, which is all a trace says about it. */
export type ScanResult = { changed: string[]; removed: string[] };

/** Runs a project scan (which reindexes changed files) inside a span and times it. */
export async function observeScan<T extends ScanResult>(scan: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await withSpan('workspace.scan', {}, async span => {
      const result = await scan();
      span.setAttributes({
        'sw.scan.changed_files': result.changed.length,
        'sw.scan.removed_files': result.removed.length,
      });
      return result;
    });
  } finally {
    recordScan(performance.now() - started);
  }
}

/** Why a document is being validated. */
export type ValidationTrigger = 'scan' | 'save';

/**
 * Times one document validation. A scan validates every changed file, so only the duration is
 * recorded there; a save is one deliberate action and also gets a span.
 */
export function observeValidation<T>(trigger: ValidationTrigger, validate: () => T): T {
  const started = performance.now();
  try {
    if (trigger === 'scan') return validate();
    return withSpanSync(
      'validation',
      { attributes: { 'sw.validation.trigger': trigger } },
      validate,
    );
  } finally {
    recordValidation(trigger, performance.now() - started);
  }
}
