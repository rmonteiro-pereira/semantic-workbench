/** Displays the same set notice in the validation dialog and definition details. */
import type { ReaderValidation } from '../../shared/tessera/set-validation';

/** Explains why the displayed single-file findings cannot represent the whole set. */
export function UnitSetNotice({ validation }: { validation?: ReaderValidation }) {
  if (!validation?.setNotChecked) return null;
  return <p role="status">The ontology set was not checked for you. Single-file findings are shown. Set rules are checked with the whole unit.</p>;
}
