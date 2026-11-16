// Registrations connect reviewed inventory metadata to the response owner's classifiers.
import { classifyCommitResult } from '../projects/scm';
import { classifyRemoteResult } from '../projects/scm-remote';
import { classifyCloneAcceptance } from '../projects/clone';
import { classifyBatchSave, classifyFileSave } from '../projects/workspace/document-save';
import { classifyImportResult } from '../projects/workspace/import-batch';
import type { OutcomeClassifier } from './operation-outcome';

/** Semantic classifiers supported by the checked-in operation inventory. */
export const operationClassifiers: Record<string, OutcomeClassifier> = Object.fromEntries(
  Object.entries({
    commit: classifyCommitResult,
    remote: classifyRemoteResult,
    cloneAcceptance: classifyCloneAcceptance,
    batchSave: classifyBatchSave,
    fileSave: classifyFileSave,
    import: classifyImportResult,
  }).map(([name, classify]) => [name, async (response: Response) => (response.status === 200 ? classify(await response.json()) : refusalOutcome(response.status))]),
);

function refusalOutcome(status: number) {
  return [409, 412, 428].includes(status) ? ('refused' as const) : ('failed' as const);
}
