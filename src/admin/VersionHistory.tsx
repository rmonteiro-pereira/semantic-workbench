import { useCallback, useState } from 'react';
import { AdminDialog, type DialogProps } from './AdminDialog';
import { SelectField } from './SelectField';
import { whenLabel } from './when';
import { adminApi, problemText } from './api';
import { useAdminData } from './useAdminData';
import { DryRunResult } from './ReviewChange';
import { DiffView } from '../scm/DiffView';
import type { DryRun, VersionDiff } from './types';

/** Compares administration versions and rolls back after reviewing who gains or loses access. */
export function VersionHistory({ area = '', onClose }: DialogProps & { area?: string }) {
  const load = useCallback(async () => {
    const current = await adminApi.versions();
    const versions = area ? await adminApi.versions(area) : current;
    return { versions, baseVersion: current[0]?.version ?? '' };
  }, [area]);
  const { data, error: loadError, reload } = useAdminData(load);
  const [selected, setSelected] = useState('');
  const [against, setAgainst] = useState('');
  const [diff, setDiff] = useState<VersionDiff[] | null>(null);
  const [error, setError] = useState('');
  const [review, setReview] = useState<DryRun | null>(null);
  const [busy, setBusy] = useState(false);
  function clearComparison() {
    setDiff(null);
    setReview(null);
  }
  async function compare() {
    setBusy(true);
    setError('');
    clearComparison();
    try {
      setDiff(await adminApi.diff(selected, against));
    } catch (problem) {
      setError(problemText(problem));
    } finally {
      setBusy(false);
    }
  }
  async function previewRollback() {
    setBusy(true);
    setError('');
    setReview(null);
    try {
      setReview(await adminApi.dryRun({ rollbackTo: selected }));
    } catch (problem) {
      setError(`Review rollback to ${selected}: ${problemText(problem)}`);
    } finally {
      setBusy(false);
    }
  }
  async function rollback() {
    if (!review) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.rollback(selected, data?.baseVersion ?? '', review.dryRunId);
      clearComparison();
      reload();
    } catch (problem) {
      setReview(null);
      setError(`Roll back ${selected}: ${problemText(problem)}`);
    } finally {
      setBusy(false);
    }
  }
  function selectVersion(value: string) {
    setSelected(value);
    clearComparison();
  }
  function selectAgainst(value: string) {
    setAgainst(value);
    clearComparison();
  }
  return (
    <AdminDialog title="Version history" onClose={onClose}>
      {(error || loadError) && <p role="alert">{error || loadError}</p>}
      <SelectField
        label="Version"
        value={selected}
        onChange={event => selectVersion(event.target.value)}
      >
        <option value="">Choose a version</option>
        {data?.versions.map(item => (
          <option key={item.version} value={item.version}>
            {whenLabel(item.at)} · {item.author} · {item.message}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Compare against"
        value={against}
        onChange={event => selectAgainst(event.target.value)}
      >
        <option value="">Previous version</option>
        {data?.versions.map(item => (
          <option key={item.version} value={item.version}>
            {whenLabel(item.at)} · {item.message}
          </option>
        ))}
      </SelectField>
      <button disabled={!selected || busy} onClick={compare}>
        Show diff
      </button>
      {diff?.map(file => (
        <DiffView
          key={file.file}
          filename={file.file}
          before={file.before}
          after={file.after}
          beforeLabel={against || 'Previous version'}
          afterLabel={selected}
          label={file.file}
        />
      ))}
      <button disabled={!selected || busy || !diff} onClick={previewRollback}>
        Roll back
      </button>
      {review && (
        <section aria-label="Confirm rollback">
          <p>
            Restoring version {selected} creates a new commit. Review who gains or loses access,
            then confirm.
          </p>
          <DryRunResult result={review} />
          <button disabled={busy} onClick={rollback}>
            Confirm rollback
          </button>
          <button onClick={() => setReview(null)}>Cancel rollback</button>
        </section>
      )}
    </AdminDialog>
  );
}
