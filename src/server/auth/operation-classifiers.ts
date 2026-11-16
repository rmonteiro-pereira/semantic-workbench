// Registrations connect reviewed inventory metadata to the response owner's classifiers.
import { classifyCommitResult } from '../projects/scm';
import { classifyRemoteResult } from '../projects/scm-remote';
import { classifyCloneAcceptance } from '../projects/clone';
import { classifyBatchSave, classifyFileSave } from '../projects/workspace/document-save';
import { classifyImportResult } from '../projects/workspace/import-batch';
import { statusOutcome, type OperationOutcome, type OutcomeClassifier } from './operation-outcome';

/** Semantic classifiers supported by the checked-in operation inventory. */
export const operationClassifiers = {
  commit: responseClassifier(classifyCommitResult),
  remote: responseClassifier(classifyRemoteResult),
  cloneAcceptance: responseClassifier(classifyCloneAcceptance),
  batchSave: responseClassifier(classifyBatchSave),
  fileSave: responseClassifier(classifyFileSave),
  import: responseClassifier(classifyImportResult),
} satisfies Record<string, OutcomeClassifier>;

function responseClassifier<T>(classify: (body: T) => OperationOutcome): OutcomeClassifier {
  return async response => {
    if (response.status === 200) return classify(await response.json());
    return response.ok ? 'failed' : statusOutcome(response.status);
  };
}
