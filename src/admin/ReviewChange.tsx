import { useState } from 'react';
import { adminApi, AdminApiError, problemText } from './api';
import { DialogActions } from './AdminDialog';
import { canConfirm, proposalKey } from './change-review';
import type { AccessArea, DryRun, Proposal } from './types';

/** Shows every changed case and each person's gained or lost project actions. */
export function DryRunResult({ result }: { result: DryRun }) {
  return (
    <section aria-label="Dry-run result">
      <h3>What changes for whom</h3>
      <p>
        {result.matrixCases} matrix cases · {result.auditCases} audit snapshots
      </p>
      {!result.people.length && <p>No known person or client changes access.</p>}
      {result.people.map((person, index) => (
        <p key={index}>
          <strong title={person.principal}>{person.name}</strong>
          <span className="admin-review-detail">
            {person.project}: access {person.access}; gained {person.gained.join(', ') || 'none'};
            lost {person.lost.join(', ') || 'none'}
          </span>
        </p>
      ))}
      {result.changed.map((change, index) => (
        <details key={index}>
          <summary>{change.case}</summary>
          <pre>
            {JSON.stringify(
              { before: change.before, after: change.after, rules: change.rules },
              null,
              2,
            )}
          </pre>
        </details>
      ))}
    </section>
  );
}

/** Lists the people a role deletion would affect, from the server's `inUse` refusal. */
export function inUseMessage(inUse: unknown): string {
  const people = (inUse as { people?: { id: string; name?: string }[] } | null)?.people ?? [];
  if (!people.length) return 'The role still has grants.';
  return 'Affected people: ' + people.map(person => person.name ?? person.id).join(', ') + '.';
}

/** Requires a matching dry run and explicit confirmation before activating changes. */
export function ReviewChange({
  area,
  proposal,
  baseVersion,
  onSaved,
  disabled = false,
  confirmDeleteInUse = false,
  description = 'Save changes',
  changeLabel,
  inline = false,
}: {
  area: AccessArea;
  proposal: Proposal;
  baseVersion: string;
  onSaved: () => void;
  disabled?: boolean;
  confirmDeleteInUse?: boolean;
  description?: string;
  changeLabel?: string;
  /** Leaves the buttons in the body when the dialog holds more than one review. */
  inline?: boolean;
}) {
  const [review, setReview] = useState<{ key: string; result: DryRun } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = proposalKey(proposal, baseVersion);
  const ready = canConfirm(review, key);
  async function preview() {
    setBusy(true);
    setError('');
    setReview(null);
    try {
      const result = await adminApi.dryRun(proposal);
      setReview({ key, result });
    } catch (problem) {
      showError(problem);
    } finally {
      setBusy(false);
    }
  }
  function showError(problem: unknown) {
    let message = problemText(problem);
    if (problem instanceof AdminApiError && problem.details.error === 'stale') {
      message += ' Reopen this area to load the current version. No change was saved.';
    }
    if (problem instanceof AdminApiError && problem.details.inUse) {
      message += ' ' + inUseMessage(problem.details.inUse);
    }
    setError(`${changeLabel ?? description}: ${message}`);
  }
  async function save() {
    if (!ready || !review) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.save(area, proposal, baseVersion, review.result.dryRunId, confirmDeleteInUse);
      setReview(null);
      onSaved();
    } catch (problem) {
      setReview(null);
      showError(problem);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-review" aria-label={description}>
      {error && <p role="alert">{error}</p>}
      {ready && review && <DryRunResult result={review.result} />}
      <DialogActions inline={inline}>
        <button className={ready ? '' : 'primary'} disabled={busy || disabled} onClick={preview}>
          Dry run
        </button>
        {ready && review && (
          <>
            <button className="primary" disabled={busy || disabled} onClick={save}>
              Confirm {description.toLowerCase()}
            </button>
            <button disabled={busy} onClick={() => setReview(null)}>
              Cancel changes
            </button>
          </>
        )}
      </DialogActions>
    </section>
  );
}
