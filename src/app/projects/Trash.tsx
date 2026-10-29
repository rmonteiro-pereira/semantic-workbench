/** Restores or permanently deletes trash entries, offering alternate paths instead of overwriting
 * files. */
import { useCapabilities } from '../auth/Capabilities';
import React, { useEffect, useState } from 'react';
import { EmptyState } from './EmptyState';
import { Modal } from './Modal';
import { api, type TrashItem } from './api';
import { otherProjectFilesLine, trashSections } from './trash-sections';
// Restore or permanently delete trash entries; emptying the trash asks for confirmation. A restore
// never overwrites; when the location is taken, the free alternative is offered.
// How a trash entry reads in the list.
function entryLabel(item: TrashItem) {
  if (item.kind === 'file') return `${item.path} (${item.projectName})`;
  if (item.kind === 'repository') return `Repository ${item.projectName} with its projects`;
  if (item.kind === 'subproject') return `Folder of project ${item.projectName}`;
  return `Project ${item.projectName}`;
}
/** Reviews trash entries and offers restore or confirmed permanent deletion. */
export function TrashDialog({ onClose, version, selectedProject, selectedProjectName }: { onClose: () => void; version: number; selectedProject: string; selectedProjectName: string }) {
  const access = useCapabilities();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [occupied, setOccupied] = useState<{
    id: string;
    message: string;
    suggestion: { toProject?: string; toPath?: string };
  } | null>(null);
  const load = () =>
    api
      .trash()
      .then(setItems)
      .catch(e => setError(e.message));
  useEffect(() => {
    load();
  }, [version]);
  async function act(run: () => Promise<unknown>) {
    setError('');
    try {
      await run();
      await load();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function restore(id: string, target = {}) {
    setError('');
    setOccupied(null);
    try {
      await api.restore(id, target);
      await load();
    } catch (error: any) {
      if (error.status === 409 && error.body?.suggestion) setOccupied({ id, message: error.body.message, suggestion: error.body.suggestion });
      else setError(error.message);
    }
  }
  function renderRow(trashItem: TrashItem) {
    return (
      <li key={trashItem.entryId}>
        <div>
          <strong>{entryLabel(trashItem)}</strong>
          <small>
            Deleted {new Date(trashItem.deletedAt).toLocaleString()}
            {trashItem.batchId ? ' · by Clear' : ''}
          </small>
        </div>
        {confirming === trashItem.entryId ? (
          <span className="trash-confirm">
            Delete permanently?{' '}
            <button className="danger" onClick={() => act(() => api.purge(trashItem.entryId))}>
              Yes, delete
            </button>
            <button onClick={() => setConfirming(null)}>No</button>
          </span>
        ) : (
          <span>
            <button hidden={!access.can('restoreOwn', trashItem.project)} onClick={() => restore(trashItem.entryId)}>
              Restore
            </button>
            <button hidden={!access.can('purge')} onClick={() => setConfirming(trashItem.entryId)}>
              Delete permanently
            </button>
          </span>
        )}
      </li>
    );
  }
  const sections = trashSections(items ?? [], selectedProject);
  const count = items?.length ?? 0;
  const emptyingNote = confirming === '*' ? `Permanently delete all ${count} item${count === 1 ? '' : 's'} in the trash, from every project? This cannot be undone.` : undefined;
  const footer =
    confirming === '*' ? (
      <>
        <button onClick={() => setConfirming(null)}>Cancel</button>
        <button
          className="danger"
          onClick={() => {
            setConfirming(null);
            act(() => api.emptyTrash());
          }}
        >
          Empty trash
        </button>
      </>
    ) : (
      <>
        {access.can('purge') && !!items?.length && <button onClick={() => setConfirming('*')}>Empty trash</button>}
        <button onClick={onClose}>Close</button>
      </>
    );
  let dialogBody: React.ReactNode;
  if (items === null) {
    dialogBody = <p>Loading</p>;
  } else if (items.length === 0) {
    dialogBody = <EmptyState title="Nothing here yet">Deleted projects and files stay here until you empty the trash.</EmptyState>;
  } else {
    dialogBody = (
      <>
        {sections.otherProjectFiles > 0 && <p className="trash-elsewhere">{otherProjectFilesLine(sections.otherProjectFiles)}</p>}
        {sections.files.length > 0 && (
          <section aria-label="Deleted files">
            <h3>Deleted files in {selectedProjectName}</h3>
            <ul className="trash-list">{sections.files.map(renderRow)}</ul>
          </section>
        )}
        {sections.projects.length > 0 && (
          <section aria-label="Deleted projects">
            <h3>Deleted projects</h3>
            <ul className="trash-list">{sections.projects.map(renderRow)}</ul>
          </section>
        )}
      </>
    );
  }
  return (
    <Modal title="Trash" onCancel={onClose} className="trash-dialog" footer={footer} footerNote={emptyingNote}>
      {dialogBody}
      {occupied && (
        <div role="alert" className="delete-warning">
          <p>{occupied.message}</p>
          <button onClick={() => restore(occupied.id, occupied.suggestion)}>Restore as {occupied.suggestion.toPath ?? occupied.suggestion.toProject}</button>
        </div>
      )}
      {error && (
        <p role="alert" className="dialog-error">
          {error}
        </p>
      )}
    </Modal>
  );
}
