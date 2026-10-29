/** Provides project renaming, file moving and import-conflict dialogs. */
import React, { useState } from 'react';
import { Modal } from './Modal';
import { api, type ProjectInfo } from './api';

/** Renames a project's display label while retaining its folder identifier. */
export function RenameDialog({ project, onClose, onDone }: { project: ProjectInfo; onClose: () => void; onDone: (name: string) => void }) {
  const [name, setName] = useState(project.name);
  const [error, setError] = useState('');
  const footer = (
    <>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
      <button className="primary" type="submit" form="rename-project" disabled={!name.trim()}>
        Rename
      </button>
    </>
  );
  return (
    <Modal title={`Rename ${project.name}`} onCancel={onClose} footer={footer}>
      <form
        id="rename-project"
        onSubmit={async e => {
          e.preventDefault();
          setError('');
          try {
            const r = await api.rename(project.slug, name);
            onDone(r.name);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <label className="compact-field">
          Project name
          <input autoFocus value={name} maxLength={200} onChange={e => setName(e.target.value)} />
        </label>
        {error && (
          <p role="alert" className="dialog-error">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

/** Moves a file to another project and offers an alternate name when occupied. */
export function MoveDialog({
  project,
  path,
  projects,
  onClose,
  onDone,
}: {
  project: string;
  path: string;
  projects: ProjectInfo[];
  onClose: () => void;
  onDone: (to: { project: string; path: string }) => void;
}) {
  const others = projects.filter(p => p.slug !== project);
  const [target, setTarget] = useState(others[0]?.slug ?? '');
  const [toPath, setToPath] = useState(path.split('/').pop()!);
  const [error, setError] = useState('');
  async function move() {
    setError('');
    try {
      onDone(await api.move(project, path, target, toPath));
    } catch (e: any) {
      if (e.status === 409 && e.body?.suggestion?.toPath) {
        setToPath(e.body.suggestion.toPath);
        setError(`${e.body.message} The name below is free.`);
      } else setError(e.message);
    }
  }
  const footer = others.length ? (
    <>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
      <button className="primary" type="submit" form="move-file" disabled={!target || !toPath.trim()}>
        Move
      </button>
    </>
  ) : (
    <button onClick={onClose}>Close</button>
  );
  return (
    <Modal title={`Move ${path}`} onCancel={onClose} footer={footer}>
      {others.length ? (
        <form
          id="move-file"
          onSubmit={e => {
            e.preventDefault();
            void move();
          }}
        >
          <label>
            Target project
            <select autoFocus value={target} onChange={e => setTarget(e.target.value)}>
              {others.map(p => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="compact-field">
            Path in that project (folder and file name)
            <input value={toPath} onChange={e => setToPath(e.target.value)} />
          </label>
          {error && (
            <p role="alert" className="dialog-error">
              {error}
            </p>
          )}
        </form>
      ) : (
        <p>There is no other project to move this file to.</p>
      )}
    </Modal>
  );
}

/** Asks whether to replace an existing filename or keep both files. */
export function ImportConflictDialog({
  project,
  conflicts,
  onChoose,
  onClose,
}: {
  project: ProjectInfo;
  conflicts: string[];
  onChoose: (choice: 'replace' | 'keep-both') => void;
  onClose: () => void;
}) {
  const footer = (
    <>
      <button onClick={onClose}>Cancel</button>
      <button onClick={() => onChoose('keep-both')}>Keep both</button>
      <button className="danger" onClick={() => onChoose('replace')}>
        Replace
      </button>
    </>
  );
  return (
    <Modal title={`Files already exist in ${project.name}`} onCancel={onClose} footer={footer}>
      <ul className="delete-list">
        {conflicts.map(c => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <p>Replace overwrites these files with the imported ones (committed versions remain in the project's Git history). Keep both imports them as "name (2)".</p>
    </Modal>
  );
}

/** Chooses from server-supplied domains before a new project request is sent. */
export function ProjectDomainDialog({
  domains,
  allowUnassigned,
  onChoose,
  onClose,
}: {
  domains: { id: string; name: string }[];
  allowUnassigned: boolean;
  onChoose: (domain: string | undefined) => void;
  onClose: () => void;
}) {
  const [domain, setDomain] = useState(allowUnassigned ? '' : (domains[0]?.id ?? ''));
  function submit(event: React.FormEvent) {
    event.preventDefault();
    onChoose(domain || undefined);
  }
  const footer = (
    <>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
      <button className="primary" type="submit" form="project-domain" disabled={!allowUnassigned && !domain}>
        Continue
      </button>
    </>
  );
  return (
    <Modal title="New project's domain" onCancel={onClose} footer={footer}>
      <form id="project-domain" onSubmit={submit}>
        <label>
          Domain
          <select value={domain} onChange={event => setDomain(event.target.value)}>
            {allowUnassigned && <option value="">No domain</option>}
            {domains.map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </form>
    </Modal>
  );
}
