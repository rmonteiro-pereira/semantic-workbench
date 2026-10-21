/** Dialog that adds, changes or removes a project's remote. */
import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '../projects/Modal';
import { scm } from '../projects/api';

type Props = { project: string; onClose: () => void };

type FooterProps = {
  existing: boolean;
  busy: boolean;
  canSave: boolean;
  onRemove: () => void;
  onCancel: () => void;
  onSave: () => void;
};

function RemoteFooter({ existing, busy, canSave, onRemove, onCancel, onSave }: FooterProps) {
  return (
    <>
      {existing && (
        <button type="button" className="danger" disabled={busy} onClick={onRemove}>
          Remove remote
        </button>
      )}
      <span className="dialog-footer-spacer" />
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" className="primary" disabled={busy || !canSave} onClick={onSave}>
        Save remote
      </button>
    </>
  );
}

/** Edits the repository's remote; Fetch, Pull, Push and Sync use it afterwards. */
export function RemoteDialog({ project, onClose }: Props) {
  const [remotes, setRemotes] = useState<Record<string, string>>({});
  const [name, setName] = useState('origin');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const existing = Object.hasOwn(remotes, name);
  const typed = useRef(false);

  useEffect(() => {
    scm
      .status(project)
      .then(status => {
        setRemotes(status.remotes);
        const first = Object.keys(status.remotes)[0];
        // Prefill from the first remote unless the user has started typing.
        if (first && !typed.current) {
          setName(first);
          setUrl(status.remotes[first]);
        }
      })
      .catch(e => setError((e as Error).message));
  }, [project]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function saveRemote(event?: React.FormEvent) {
    event?.preventDefault();
    void run(() => scm.setRemote(project, name.trim(), url));
  }

  const footer = (
    <RemoteFooter
      existing={existing}
      busy={busy}
      canSave={!!name.trim() && !!url.trim()}
      onRemove={() => void run(() => scm.removeRemote(project, name))}
      onCancel={onClose}
      onSave={() => saveRemote()}
    />
  );

  return (
    <Modal title="Remote" onCancel={onClose} footer={footer} size="small">
      <form className="remote-form" onSubmit={saveRemote}>
        <p className="dialog-intro">
          The repository this project pushes to and pulls from. Use a URL, an SSH address or a
          folder path.
        </p>
        <label>
          <span>Remote name</span>
          <input
            aria-label="Remote name"
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
            aria-label="Remote URL"
            value={url}
            onChange={e => {
              typed.current = true;
              setUrl(e.target.value);
            }}
            placeholder="https://… or git@… or /path/to/repo.git"
          />
        </label>
        {error && (
          <p role="alert" className="dialog-error">
            {error}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
