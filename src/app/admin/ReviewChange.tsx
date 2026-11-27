import { UnsavedChangesNote } from './SaveStatus';
import { useState } from 'react';
import { adminApi, AdminApiError } from './api';
import { AdminConfirmation } from './AdminConfirmation';
import { canConfirm, proposalKey, reviewProblemText, lowerFirst } from './change-review';
import type { AccessArea, DryRun, Proposal } from './types';

const previewLabels: Partial<Record<AccessArea, string>> = {
  projects: 'Preview project access',
  agents: 'Preview agent grants',
};

/** Shows every changed case and each person's gained or lost project actions. */
export function DryRunResult({ result }: { result: DryRun }) {
  return (
    <section aria-label="Dry-run result">
      <h3>What changes for whom</h3>
      {result.programs?.endings.map(program => (
        <p key={program.clientId}>
          Confirming ends {program.connections} connection(s) for {program.name} ({program.clientId}).
        </p>
      ))}
      <p>
        Checked {result.matrixCases} access scenarios and {result.auditCases} recent access decisions.
      </p>
      {!result.people.length && <p>No known person or client changes access.</p>}
      {result.people.map((person, index) => (
        <p key={index}>
          <strong title={person.principal}>{person.name}</strong>
          <span className="admin-review-detail">
            {person.project}: access {person.access}; gained {person.gained.join(', ') || 'none'}; lost {person.lost.join(', ') || 'none'}
          </span>
        </p>
      ))}
      {result.changed.map((change, index) => (
        <details key={index}>
          <summary>{change.case}</summary>
          <pre>{JSON.stringify({ before: change.before, after: change.after, rules: change.rules }, null, 2)}</pre>
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

/** Lists what a change removes, as one sentence that wraps however long the names are. */
function RemovedNames({ names }: { names: string[] }) {
  if (!names.length) return null;
  return <p>This change removes {names.join('; ')}.</p>;
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
  destructive = false,
  confirmLabel,
  removedNames = [],
  dirty = false,
  unavailableReason,
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
  /** The change removes or ends something, so its confirm button is the danger one. */
  destructive?: boolean;
  /** A short confirm label for when the title already names everything the change removes. */
  confirmLabel?: string;
  /** What the change removes, listed in the result where long names can wrap. */
  removedNames?: string[];
  /** The draft differs from what is saved, so the reader is told it is not saved yet. */
  dirty?: boolean;
  /** Why the review button is unavailable, shown beside it instead of a silent grey button. */
  unavailableReason?: string;
  /**
   * Shows the result and the confirm button in place, for a review that already sits in a
   * confirmation dialog. Otherwise the result opens in its own dialog.
   */
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
    let message = reviewProblemText(problem);
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
  const confirmButtons = (
    <>
      <button className={destructive ? 'danger' : 'primary'} disabled={busy || disabled} onClick={save}>
        {confirmLabel ?? `Confirm ${lowerFirst(description)}`}
      </button>
      {inline && (
        <button disabled={busy} onClick={() => setReview(null)}>
          Cancel
        </button>
      )}
    </>
  );
  return (
    <section className="admin-review" aria-label={description}>
      {error && <p role="alert">{error}</p>}
      {inline && ready && review && <RemovedNames names={removedNames} />}
      {inline && ready && review && <DryRunResult result={review.result} />}
      <div className="admin-actions">
        <button className={ready ? '' : 'primary'} disabled={busy || disabled} onClick={preview}>
          {previewLabels[area] ?? 'Review change'}
        </button>
        {inline && ready && review && confirmButtons}
      </div>
      {disabled && unavailableReason && <p className="admin-unsaved">{unavailableReason}</p>}
      {dirty && !ready && !disabled && <UnsavedChangesNote action={previewLabels[area] ?? 'Review change'} />}
      {!inline && ready && review && (
        <AdminConfirmation title={changeLabel ?? description} onCancel={() => setReview(null)} cancelLabel="Back to editing" actions={confirmButtons}>
          <RemovedNames names={removedNames} />
          <DryRunResult result={review.result} />
        </AdminConfirmation>
      )}
    </section>
  );
}
