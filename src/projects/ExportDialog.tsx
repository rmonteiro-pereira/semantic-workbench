/** Downloads a project's files as a zip, with an optional Git bundle of its history. */
import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { api, type ProjectInfo } from './api';
import './export-dialog.css';

// Only saved files are exported. Edits that are still unsaved, in the open file or kept as
// drafts of text that does not validate, would be missing from the zip, so the dialog says so.
type Draft = { project: string; path: string };

type Props = {
  project: ProjectInfo;
  /** The open file when its editor text differs from what is saved. */
  dirty: Draft | null;
  /** Saves the open file now, so its edits are part of the export. */
  saveOpenFile: () => Promise<void>;
  onClose: () => void;
  onDone: (message: string) => void;
};

function useUnsavedDrafts(project: string, dirty: Draft | null) {
  const [stored, setStored] = useState<Draft[]>([]);
  useEffect(() => {
    api
      .drafts()
      .then(all => setStored(all.filter(draft => draft.project === project)))
      .catch(() => setStored([]));
  }, [project]);
  const open = dirty && dirty.project === project ? [dirty] : [];
  const paths = new Set([...stored, ...open].map(draft => draft.path));
  return { paths: [...paths].sort(), openFileIsUnsaved: open.length > 0 };
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function doneMessage(name: string, files: number, omitted: number) {
  const count = `${files} file${files === 1 ? '' : 's'}`;
  const left = omitted === 1 ? '1 file you cannot read' : `${omitted} files you cannot read`;
  return omitted
    ? `Exported ${count} of ${name}. Left out: ${left}.`
    : `Exported ${count} of ${name}.`;
}

function exportLabel(busy: boolean, savesFirst: boolean) {
  if (busy) return 'Exporting…';
  return savesFirst ? 'Save and export' : 'Export';
}

function UnsavedNote({ paths }: { paths: string[] }) {
  if (!paths.length) return <p className="export-note">Unsaved drafts are not exported.</p>;
  return (
    <div role="alert" className="delete-warning">
      <strong>These unsaved edits are not in the export:</strong>
      <ul>
        {paths.map(path => (
          <li key={path}>{path}</li>
        ))}
      </ul>
    </div>
  );
}

/** Asks what to include, then downloads the zip the server streams. */
export function ExportDialog({ project, dirty, saveOpenFile, onClose, onDone }: Props) {
  const [includeHistory, setIncludeHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { paths, openFileIsUnsaved } = useUnsavedDrafts(project.slug, dirty);

  async function exportNow(saveFirst: boolean) {
    setBusy(true);
    setError('');
    try {
      if (saveFirst) await saveOpenFile();
      const result = await api.exportProject(project.slug, includeHistory);
      downloadBlob(result.blob, result.fileName);
      onDone(doneMessage(project.name, result.files, result.omitted));
    } catch (e) {
      setError(`Nothing was downloaded: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  const footer = (
    <>
      <button type="button" onClick={onClose} disabled={busy}>
        Cancel
      </button>
      {openFileIsUnsaved && (
        <button type="button" onClick={() => void exportNow(false)} disabled={busy}>
          Export without them
        </button>
      )}
      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={() => void exportNow(openFileIsUnsaved)}
      >
        {exportLabel(busy, openFileIsUnsaved)}
      </button>
    </>
  );

  return (
    <Modal title={`Export ${project.name}`} onCancel={onClose} footer={footer} size="small">
      <p className="dialog-intro">
        Downloads a .zip of the project's files exactly as stored, in their folders, with
        .gitignore. The .git folder and files Git ignores are left out.
      </p>
      <fieldset className="export-choice">
        <label className="check-row">
          <input
            type="checkbox"
            checked={includeHistory}
            onChange={event => setIncludeHistory(event.target.checked)}
          />
          <span className="choice-text">
            <span className="choice-title">Include Git history</span>
            <span className="choice-hint">
              Adds a Git bundle of the repository that git clone can read.
            </span>
          </span>
        </label>
      </fieldset>
      <UnsavedNote paths={paths} />
      {error && (
        <p role="alert" className="dialog-error">
          {error}
        </p>
      )}
    </Modal>
  );
}
