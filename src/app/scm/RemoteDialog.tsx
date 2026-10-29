/** Dialog that adds, changes or removes a project's remote, and the folder it lives in. */
import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '../projects/Modal';
import { scm, type FolderPreview } from '../projects/api';
import { FolderConfirmation } from './FolderConfirmation';
import { FolderField, useFolderInput } from './FolderField';

type Props = { project: string; onClose: () => void };

type FooterProps = {
  existing: boolean;
  busy: boolean;
  canSave: boolean;
  /** Set while the person reads what a folder change would do. */
  confirming: FolderPreview | null;
  onRemove: () => void;
  onCancel: () => void;
  onSave: () => void;
  onBack: () => void;
  onConfirm: () => void;
};

function confirmLabel(preview: FolderPreview) {
  return preview.kind === 'move' ? 'Move files and save' : 'Check out folder and save';
}

// The title names the step: the form says what it will do, the preview says what to review.
function remoteDialogTitle(confirming: FolderPreview | null, existing: boolean) {
  if (confirming) return 'Review file move';
  return existing ? 'Change remote' : 'Connect a remote';
}

function RemoteFooter(props: FooterProps) {
  const { existing, busy, canSave, confirming } = props;
  if (confirming)
    return (
      <>
        <button type="button" disabled={busy} onClick={props.onBack}>
          Back
        </button>
        <span className="dialog-footer-spacer" />
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={busy || !!confirming.blocked} onClick={props.onConfirm}>
          {confirmLabel(confirming)}
        </button>
      </>
    );
  return (
    <>
      {existing && (
        <button type="button" className="danger" disabled={busy} onClick={props.onRemove}>
          Remove remote
        </button>
      )}
      <span className="dialog-footer-spacer" />
      <button type="button" onClick={props.onCancel}>
        Cancel
      </button>
      <button type="button" className="primary" disabled={busy || !canSave} onClick={props.onSave}>
        Save remote
      </button>
    </>
  );
}

/** Edits the repository's remote and folder; Fetch, Pull, Push and Sync use them afterwards. */
export function RemoteDialog({ project, onClose }: Props) {
  const [remotes, setRemotes] = useState<Record<string, string>>({});
  const [name, setName] = useState('origin');
  const [url, setUrl] = useState('');
  const folderInput = useFolderInput();
  const [currentFolder, setCurrentFolder] = useState('');
  const [confirming, setConfirming] = useState<FolderPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // The fields stay locked until the current remote is known. Prefilling later would otherwise
  // land in the middle of what the person is already typing.
  const [loaded, setLoaded] = useState(false);
  const existing = Object.hasOwn(remotes, name);
  const typed = useRef(false);
  const urlField = useRef<HTMLInputElement>(null);
  // The control the dialog focused when it opened, so a later move by the person can be told apart.
  const openingFocus = useRef<Element | null>(null);
  const folderChanged = folderInput.folder !== '' && folderInput.folder !== currentFolder;

  useEffect(() => {
    openingFocus.current = document.activeElement;
  }, []);

  // Once the settings are known, editing starts in the address field unless focus already moved.
  useEffect(() => {
    if (!loaded || typed.current) return;
    const active = document.activeElement;
    const untouched = active === openingFocus.current || active === document.body;
    if (untouched) urlField.current?.focus();
  }, [loaded]);

  useEffect(() => {
    scm
      .status(project)
      .then(status => {
        setRemotes(status.remotes);
        setCurrentFolder(status.folder ?? '');
        const first = Object.keys(status.remotes)[0];
        // Prefill from the first remote unless the user has started typing.
        if (first && !typed.current) {
          setName(first);
          setUrl(status.remotes[first]);
        }
        if (!typed.current) folderInput.setText(status.folder ?? '');
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoaded(true));
    // The folder setter is stable, and the status is read once per project.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      onClose();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function previewFolder() {
    setBusy(true);
    setError('');
    try {
      setConfirming(await scm.folderPreview(project, folderInput.folder));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function saveRemote(event?: React.FormEvent) {
    event?.preventDefault();
    if (folderInput.problem) return;
    if (folderChanged) void previewFolder();
    else void run(() => scm.setRemote(project, name.trim(), url));
  }

  // The remote is saved first, so a refused folder change still leaves the remote in place.
  function confirmFolder(preview: FolderPreview) {
    const createFolder = preview.kind === 'change' && !preview.existsOnBranch;
    void run(async () => {
      if (url.trim()) await scm.setRemote(project, name.trim(), url);
      await scm.setFolder(project, preview.folder, createFolder);
    });
  }

  const footer = (
    <RemoteFooter
      existing={existing}
      busy={busy}
      canSave={((!!name.trim() && !!url.trim()) || folderChanged) && !folderInput.problem}
      confirming={confirming}
      onRemove={() => void run(() => scm.removeRemote(project, name))}
      onCancel={onClose}
      onSave={() => saveRemote()}
      onBack={() => setConfirming(null)}
      onConfirm={() => confirming && confirmFolder(confirming)}
    />
  );

  return (
    <Modal title={remoteDialogTitle(confirming, existing)} onCancel={onClose} footer={footer}>
      {confirming ? (
        <>
          <FolderConfirmation preview={confirming} />
          {error && (
            <p role="alert" className="dialog-error">
              {error}
            </p>
          )}
        </>
      ) : (
        <form className="remote-form" onSubmit={saveRemote}>
          <p className="dialog-intro">The repository this project pushes to and pulls from. Use a URL, an SSH address or a folder path.</p>
          <label>
            <span>Remote name</span>
            <input
              aria-label="Remote name"
              disabled={!loaded}
              value={name}
              onChange={e => {
                typed.current = true;
                setName(e.target.value);
              }}
            />
          </label>
          <label>
            <span>Remote URL or path</span>
            <input
              ref={urlField}
              aria-label="Remote URL"
              disabled={!loaded}
              value={url}
              onChange={e => {
                typed.current = true;
                setUrl(e.target.value);
              }}
              placeholder="https://… or git@… or /path/to/repo.git"
            />
          </label>
          <FolderField
            value={folderInput.text}
            problem={folderInput.problem}
            disabled={!loaded}
            onChange={text => {
              typed.current = true;
              folderInput.setText(text);
            }}
            hint="Leave empty to keep the current folder. Changing it previews a file move in local mode. In server mode, clone the folder instead."
          />
          {error && (
            <p role="alert" className="dialog-error">
              {error}
            </p>
          )}
          <button type="submit" hidden />
        </form>
      )}
    </Modal>
  );
}
