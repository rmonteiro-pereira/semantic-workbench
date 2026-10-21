/** Confirms project or file deletion after showing affected files, unsaved edits and broken
 * references. */
import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { api, type Impact, type ProjectInfo } from './api';
// The confirmation names everything that is removed and warns about unsaved edits and references
// that will no longer resolve. Nothing is removed until "Delete" is pressed.
/** Identifies the project or file being considered for deletion. */
export type DeleteTarget =
  | { kind: 'file'; project: string; path: string }
  | { kind: 'project'; project: string }
  | { kind: 'clear' };
/** Shows deletion impact and requires an explicit delete action. */
export function DeleteDialog({
  target,
  projects,
  dirty,
  onCancel,
  onDeleted,
}: {
  target: DeleteTarget;
  projects: ProjectInfo[];
  dirty: { project: string; path: string } | null;
  onCancel: () => void;
  onDeleted: (entryIds: string[], undoUntil: string, label: string) => void;
}) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [drafts, setDrafts] = useState<{ project: string; path: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const name = (slug: string) => projects.find(p => p.slug === slug)?.name ?? slug;
  useEffect(() => {
    if (target.kind === 'clear')
      api
        .drafts()
        .then(setDrafts)
        .catch(e => setError(e.message));
    else
      api
        .deleteImpact(target.project, target.kind === 'file' ? target.path : undefined)
        .then(setImpact)
        .catch(e => setError(e.message));
  }, []);
  const label =
    target.kind === 'file'
      ? target.path
      : target.kind === 'project'
        ? `project ${name(target.project)}`
        : 'every project in the workspace';
  const removed = (x: { project: string; path: string }) =>
    target.kind === 'clear' ||
    (x.project === target.project && (target.kind === 'project' || x.path === target.path));
  const unsaved = [
    ...(impact?.unsavedDrafts ?? drafts.filter(removed)),
    ...(dirty && removed(dirty) ? [dirty] : []),
  ];
  async function confirm() {
    setBusy(true);
    setError('');
    try {
      if (target.kind === 'file') {
        const r = await api.deleteFile(target.project, target.path);
        onDeleted([r.entryId], r.undoUntil, target.path);
      } else if (target.kind === 'project') {
        const r = await api.deleteProject(target.project);
        onDeleted([r.entryId], r.undoUntil, name(target.project));
      } else {
        const r = await api.clear();
        onDeleted(r.entries, r.undoUntil ?? new Date().toISOString(), 'the workspace');
      }
    } catch (e) {
      setError(`Nothing was deleted: ${(e as Error).message}`);
      setBusy(false);
    }
  }
  return (
    <Modal
      title={target.kind === 'clear' ? 'Clear workspace?' : `Delete ${label}?`}
      onCancel={onCancel}
    >
      <p>
        {target.kind === 'clear'
          ? 'Every project moves to the trash as its own entry, with its Git history.'
          : 'It moves to the trash; you can undo for 10 seconds and restore it from the trash later.'}
      </p>
      <h3>Removed</h3>
      <ul className="delete-list">
        {target.kind === 'clear' ? (
          projects.map(p => (
            <li key={p.slug}>
              {p.name} ({p.files.length} file{p.files.length === 1 ? '' : 's'})
            </li>
          ))
        ) : target.kind === 'project' ? (
          impact ? (
            <>
              <li>
                Project {impact.removes.name ?? name(target.project)}, including its Git history
              </li>
              {impact.removes.files.map(f => (
                <li key={f}>{f}</li>
              ))}
            </>
          ) : (
            <li>Loading…</li>
          )
        ) : (
          <li>
            {target.path} in {name(target.project)}
          </li>
        )}
      </ul>
      {unsaved.length > 0 && (
        <div role="alert" className="delete-warning">
          <strong>Unsaved edits will be lost:</strong>
          <ul>
            {unsaved.map((d, i) => (
              <li key={i}>
                {d.path} in {name(d.project)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(impact?.brokenReferences.length ?? 0) > 0 && (
        <div className="delete-warning">
          <strong>These references will no longer resolve:</strong>
          <ul>
            {impact!.brokenReferences.map((b, i) => (
              <li key={i}>
                {b.from.path} ({name(b.from.project)}) refers to "{b.name}" in {b.to.path}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p role="alert" className="dialog-error">
          {error}
        </p>
      )}
      <div className="repair-actions">
        <button onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          className="danger"
          onClick={confirm}
          disabled={busy || (target.kind !== 'clear' && !impact && !error)}
        >
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Modal>
  );
}
