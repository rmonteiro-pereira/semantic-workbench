import { useProjectDomain } from '../projects/useProjectDomain';
/** Dialog that clones a repository by URL or path into a new project, with progress and Cancel. */
import React, { useRef, useState } from 'react';
import { Modal } from '../projects/Modal';
import { scm, type CloneEvent } from '../projects/api';
import { useEvents } from '../projects/useEvents';
import { looksLikeAuthFailure } from './CredentialGuide';

type Props = {
  onClose: () => void;
  onOpenProject: (slug: string) => void;
  onCredentials: () => void;
  onChooseProjects: (repo: string) => void;
};

const PHASE_TEXT: Record<CloneEvent['phase'], string> = {
  cloning: 'Cloning… Git may ask for credentials in a separate window.',
  scanning: 'Checking the files…',
  done: 'Cloned.',
  failed: 'The clone failed.',
  cancelled: 'Clone cancelled. Nothing was added.',
};

const finished = (event: CloneEvent | null) =>
  !!event && ['done', 'failed', 'cancelled'].includes(event.phase);

// Folders below the root that could each be a project; the root alone needs no choice.
const subfolderCandidates = (event: CloneEvent | null) =>
  (event?.candidates ?? []).filter(candidate => candidate.path !== '');

// What the repository's layout meant: projects from its manifest, or folders to choose from.
function RepositoryLayout({ event }: { event: CloneEvent }) {
  const folders = subfolderCandidates(event);
  return (
    <>
      {event.manifestError && (
        <p role="alert" className="dialog-error">
          The repository's .semantic-workbench.json was not used: {event.manifestError}
        </p>
      )}
      {event.manifest && (
        <p>
          The repository's manifest made {event.manifest.projects.length} projects:{' '}
          {event.manifest.projects.map(entry => entry.name ?? entry.path).join(', ')}.
        </p>
      )}
      {folders.length > 0 && (
        <p>
          {folders.length} folders hold definitions. Choose projects… makes each chosen folder its
          own project; otherwise the repository stays one project.
        </p>
      )}
    </>
  );
}

function CloneResult({ event }: { event: CloneEvent }) {
  if (event.phase !== 'done') return event.message ? <pre>{event.message}</pre> : null;
  if (!event.invalid?.length)
    return (
      <>
        <p>Every definition file is valid. The project is in the workspace tree.</p>
        <RepositoryLayout event={event} />
      </>
    );
  return (
    <>
      <RepositoryLayout event={event} />
      <p>
        These files are not valid definitions. They were kept exactly as they are and are marked in
        the tree:
      </p>
      <ul className="clone-invalid" aria-label="Invalid files">
        {event.invalid.map(path => (
          <li key={path}>{path}</li>
        ))}
      </ul>
    </>
  );
}

type FormProps = {
  url: string;
  name: string;
  error: string;
  setUrl: (value: string) => void;
  setName: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
};

function CloneForm({ url, name, error, setUrl, setName, onSubmit }: FormProps) {
  return (
    <form className="clone-form" onSubmit={onSubmit}>
      <p className="dialog-intro">
        Copies a Git repository into a new project folder in the workspace. Line endings are kept as
        committed, links arrive as plain files and submodules are not fetched.
      </p>
      <label>
        <span>Repository URL or path</span>
        <input
          aria-label="Repository URL or path"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://… or git@… or /path/to/repo.git"
        />
      </label>
      <label>
        <span>Project name (optional)</span>
        <input
          aria-label="Project name"
          value={name}
          maxLength={120}
          onChange={e => setName(e.target.value)}
          placeholder="From the repository name"
        />
      </label>
      {error && (
        <p role="alert" className="dialog-error">
          {error}
        </p>
      )}
      <button type="submit" hidden />
    </form>
  );
}

type FooterProps = {
  started: boolean;
  running: boolean;
  canStart: boolean;
  progress: CloneEvent | null;
  onStart: () => void;
  onCancel: () => void;
  onClose: () => void;
  onOpenProject: (slug: string) => void;
  onCredentials: () => void;
  onChooseProjects: (repo: string) => void;
};

function CloneFooter(props: FooterProps) {
  const { progress } = props;
  const authFailure = progress?.phase === 'failed' && looksLikeAuthFailure(progress.message ?? '');
  const done = progress?.phase === 'done' ? progress : null;
  // A manifest replaces the repository's own project with its folders' projects.
  const cloned = done?.projects?.[0] ?? done?.repo;
  const choosable = done?.repo && subfolderCandidates(done).length > 0 ? done.repo : undefined;
  return (
    <>
      {authFailure && (
        <button type="button" onClick={props.onCredentials}>
          Credential setup guide
        </button>
      )}
      <span className="dialog-footer-spacer" />
      <button type="button" onClick={props.running ? props.onCancel : props.onClose}>
        {props.running ? 'Cancel' : 'Close'}
      </button>
      {!props.started && (
        <button
          type="button"
          className="primary"
          disabled={!props.canStart}
          onClick={props.onStart}
        >
          Clone
        </button>
      )}
      {choosable && (
        <button type="button" onClick={() => props.onChooseProjects(choosable)}>
          Choose projects…
        </button>
      )}
      {cloned && (
        <button type="button" className="primary" onClick={() => props.onOpenProject(cloned)}>
          Open project
        </button>
      )}
    </>
  );
}

/** Clones a repository as a new project; files are checked, never rewritten. */
export function CloneDialog({ onClose, onOpenProject, onCredentials, onChooseProjects }: Props) {
  const domainChoice = useProjectDomain();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [op, setOp] = useState<{ op: string; name: string } | null>(null);
  const [progress, setProgress] = useState<CloneEvent | null>(null);
  const [error, setError] = useState('');

  // A quick clone can finish before the request that started it returns, so keep every event.
  const latest = useRef(new Map<string, CloneEvent>());
  useEvents((type, data: CloneEvent) => {
    if (type !== 'clone') return;
    latest.current.set(data.op, data);
    if (op && data.op === op.op) setProgress(data);
  });

  async function start(event?: React.FormEvent) {
    event?.preventDefault();
    setError('');
    try {
      const domain = await domainChoice.choose();
      const started = await scm.clone(url.trim(), name.trim() || undefined, domain);
      setOp(started);
      setProgress(
        latest.current.get(started.op) ?? { op: started.op, phase: 'cloning', name: started.name },
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const running = !!op && !finished(progress);
  const footer = (
    <CloneFooter
      started={!!op}
      running={running}
      canStart={!!url.trim()}
      progress={progress}
      onStart={() => void start()}
      onCancel={() => op && void scm.cancelClone(op.op)}
      onClose={onClose}
      onOpenProject={onOpenProject}
      onCredentials={onCredentials}
      onChooseProjects={onChooseProjects}
    />
  );

  // While Git runs, Escape does not close the dialog: Cancel stops the clone first.
  if (domainChoice.dialog) return domainChoice.dialog;
  return (
    <Modal title="Clone repository" onCancel={running ? () => {} : onClose} footer={footer}>
      {op ? (
        <div className="clone-progress" aria-live="polite">
          <p role="status">
            {running && <span className="spinner" aria-hidden />}
            {op.name}: {PHASE_TEXT[progress?.phase ?? 'cloning']}
          </p>
          {progress && finished(progress) && <CloneResult event={progress} />}
        </div>
      ) : (
        <CloneForm
          url={url}
          name={name}
          error={error}
          setUrl={setUrl}
          setName={setName}
          onSubmit={start}
        />
      )}
    </Modal>
  );
}
