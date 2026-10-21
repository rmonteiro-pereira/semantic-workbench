/** Dialog that sets user.name and user.email in a project's repository. */
import React, { useEffect, useState } from 'react';
import { Modal } from '../projects/Modal';
import { scm } from '../projects/api';

type Props = { project: string; everyRepository?: boolean; onClose: () => void };

type FieldProps = {
  name: string;
  email: string;
  setName: (value: string) => void;
  setEmail: (value: string) => void;
};

function IdentityFields({ name, email, setName, setEmail }: FieldProps) {
  return (
    <>
      <label>
        <span>Name</span>
        <input
          aria-label="Name"
          value={name}
          maxLength={200}
          autoComplete="name"
          onChange={e => setName(e.target.value)}
        />
      </label>
      <label>
        <span>Email</span>
        <input
          aria-label="Email"
          type="email"
          value={email}
          maxLength={320}
          autoComplete="email"
          onChange={e => setEmail(e.target.value)}
        />
      </label>
    </>
  );
}

/** Sets the Git identity for this repository, or for every repository in the workspace. */
export function IdentityDialog({ project, everyRepository = false, onClose }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [all, setAll] = useState(everyRepository);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Start from the identity Git would use now, when there is one.
  useEffect(() => {
    scm
      .identity(project)
      .then(identity => {
        setName(current => current || identity.name || '');
        setEmail(current => current || identity.email || '');
      })
      .catch(() => {});
  }, [project]);

  async function save(event?: React.FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError('');
    try {
      await scm.setIdentity(project, name, email, all);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
      <button
        type="button"
        className="primary"
        disabled={busy || !name.trim() || !email.trim()}
        onClick={() => void save()}
      >
        Save identity
      </button>
    </>
  );

  return (
    <Modal title="Set Git identity" onCancel={onClose} footer={footer} size="small">
      <form className="identity-form" onSubmit={save}>
        <p className="dialog-intro">
          Commits record a name and an email. They are saved in this repository’s own Git
          configuration, not in your global settings.
        </p>
        <IdentityFields name={name} email={email} setName={setName} setEmail={setEmail} />
        <label className="check-row">
          <input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />
          <span>Also use it in every repository that has no identity yet</span>
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
