import { useProjectDomain } from '../projects/useProjectDomain';
/** Dialog that clones a repository by URL or path into a new project, with progress and Cancel. */
import React, { useReducer, useState } from 'react';
import { Modal } from '../projects/Modal';
import { scm, type CloneEvent } from '../projects/api';
import { useEvents } from '../projects/useEvents';
import { cloneProgressReducer, initialCloneProgress } from './clone-progress';
import { looksLikeAuthFailure } from './CredentialGuide';
import { definitionsSummary } from './clone-summary';
import { FolderField, useFolderInput } from './FolderField';

type Props = {
  onClose: () => void;
  onOpenProject: (slug: string) => void;
  onCredentials: (remote?: string) => void;
  onChooseProjects: (repo: string) => void;
};

const PHASE_TEXT: Record<CloneEvent['phase'], string> = {
  cloning: 'Cloning… Git may ask for credentials in a separate window.',
  scanning: 'Checking the files…',
  done: 'Cloned.',
  failed: 'The clone failed.',
  cancelled: 'Clone cancelled. Nothing was added.',
};

const finished = (event: CloneEvent | null) => !!event && ['done', 'failed', 'cancelled'].includes(event.phase);

// Folders below the root that could each be a project; the root alone needs no choice.
const subfolderCandidates = (event: CloneEvent | null) => (event?.candidates ?? []).filter(candidate => candidate.path !== '');

// What the repository's layout meant, beyond the projects it made: a manifest that could not be
// used, or folders the person may turn into projects.
function RepositoryNotes({ event }: { event: CloneEvent }) {
  const folders = subfolderCandidates(event);
  return (
    <>
      {event.manifestError && (
        <p role="alert" className="dialog-error">
          The repository's .semantic-workbench.json was not used: {event.manifestError}
        </p>
      )}
      {folders.length > 0 && <p>{folders.length} folders hold definitions. Choose projects… makes each chosen folder its own project; otherwise the repository stays one project.</p>}
    </>
  );
}

// A manifest names the projects it made; without one the clone is a single project.
function projectsMade(event: CloneEvent): string[] {
  if (event.manifest) return event.manifest.projects.map(entry => entry.name ?? entry.path);
  return [event.name ?? event.repo ?? 'The repository'];
}

function ProjectsMade({ event }: { event: CloneEvent }) {
  return (
    <section aria-label="Projects made">
      <h3>Projects made</h3>
      <ul className="clone-list">
        {projectsMade(event).map(name => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </section>
  );
}

function FilesToRepair({ paths }: { paths: string[] }) {
  return (
    <section aria-label="Files to repair">
      <h3>Files to repair</h3>
      <p className="clone-explanation">These files are not valid definitions. They were kept exactly as they are and are marked in the tree.</p>
      <ul className="clone-invalid" aria-label="Invalid files">
        {paths.map(path => (
          <li key={path}>{path}</li>
        ))}
      </ul>
    </section>
  );
}

function FailureExplanation({ event }: { event: CloneEvent }) {
  if (event.phase !== 'failed') return null;
  return <p className="clone-explanation">The repository was not cloned and nothing was added to the workspace. Check the address, folder and credentials, then edit the details or retry.</p>;
}

function CloneResult({ event }: { event: CloneEvent }) {
  if (event.phase !== 'done') {
    return (
      <>
        <FailureExplanation event={event} />
        {event.message && (
          <>
            <h3>Git details</h3>
            <pre>{event.message}</pre>
          </>
        )}
      </>
    );
  }
  return (
    <>
      <RepositoryNotes event={event} />
      <ProjectsMade event={event} />
      {event.invalid?.length ? <FilesToRepair paths={event.invalid} /> : <p>{definitionsSummary(event)}</p>}
    </>
  );
}

type FormProps = {
  url: string;
  name: string;
  folder: string;
  folderProblem: string;
  error: string;
  setUrl: (value: string) => void;
  setName: (value: string) => void;
  setFolder: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
};

function CloneForm(props: FormProps) {
  const { url, name, folder, folderProblem, error, setUrl, setName, setFolder, onSubmit } = props;
  return (
    <form className="clone-form" onSubmit={onSubmit}>
      <p className="dialog-intro">
        Copies a Git repository into a new project folder in the workspace. Line endings are kept as committed, links arrive as plain files and submodules are not fetched.
      </p>
      <label>
        <span>Repository URL or path</span>
        <input aria-label="Repository URL or path" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://… or git@… or /path/to/repo.git" />
      </label>
      <label>
        <span>Project name (optional)</span>
        <input aria-label="Project name" value={name} maxLength={120} onChange={e => setName(e.target.value)} placeholder="From the repository name" />
      </label>
      <FolderField
        value={folder}
        problem={folderProblem}
        onChange={setFolder}
        hint="Check out only this folder of the repository. It becomes the project; the rest of the repository stays off your disk."
      />
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
  onEditDetails: () => void;
  onRetry: () => void;
  onCreateFolder: () => void;
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
  const missingFolder = progress?.phase === 'failed' ? progress.missingFolder : undefined;
  const failed = progress?.phase === 'failed';
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
        {props.running || !props.started ? 'Cancel' : 'Close'}
      </button>
      {!props.started && (
        <button type="button" className="primary" disabled={!props.canStart} onClick={props.onStart}>
          Clone
        </button>
      )}
      {failed && (
        <>
          <button type="button" onClick={props.onEditDetails}>
            Edit details
          </button>
          <button type="button" className={missingFolder ? undefined : 'primary'} disabled={!props.canStart} onClick={props.onRetry}>
            Retry
          </button>
        </>
      )}
      {missingFolder && (
        <button type="button" className="primary" disabled={!props.canStart} onClick={props.onCreateFolder}>
          Create {missingFolder} with the first push
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
  const folderInput = useFolderInput();
  const [cloneState, dispatchProgress] = useReducer(cloneProgressReducer, initialCloneProgress);
  const op = cloneState.operation;
  const progress = cloneState.progress;
  const [error, setError] = useState('');

  const updatesConnected = useEvents((type, data: CloneEvent) => {
    if (type === 'clone') dispatchProgress({ type: 'progress', event: data });
  });

  async function start(event?: React.FormEvent, createFolder = false) {
    event?.preventDefault();
    if (folderInput.problem || !updatesConnected) return;
    setError('');
    try {
      const domain = await domainChoice.choose();
      const started = await scm.clone(url.trim(), name.trim() || undefined, domain, {
        folder: folderInput.folder,
        createFolder,
      });
      dispatchProgress({ type: 'started', operation: started });
    } catch (error) {
      setError((error as Error).message);
    }
  }

  const running = !!op && !finished(progress);
  const footer = (
    <CloneFooter
      started={!!op}
      running={running}
      canStart={updatesConnected && !!url.trim() && !folderInput.problem}
      progress={progress}
      onStart={() => void start()}
      onEditDetails={() => dispatchProgress({ type: 'reset' })}
      onRetry={() => void start()}
      onCreateFolder={() => void start(undefined, true)}
      onCancel={() => op && void scm.cancelClone(op.op)}
      onClose={onClose}
      onOpenProject={onOpenProject}
      onCredentials={() => onCredentials(url.trim())}
      onChooseProjects={onChooseProjects}
    />
  );

  function footerNote() {
    if (!updatesConnected) return 'Connecting to workspace updates…';
    if (op) return undefined;
    if (!url.trim()) return 'Enter a repository URL or path to clone.';
    return undefined;
  }

  // While Git runs, Escape does not close the dialog: Cancel stops the clone first.
  if (domainChoice.dialog) return domainChoice.dialog;
  return (
    <Modal title="Clone repository" onCancel={running ? () => {} : onClose} footer={footer} footerNote={footerNote()}>
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
          folder={folderInput.text}
          folderProblem={folderInput.problem}
          error={error}
          setUrl={setUrl}
          setName={setName}
          setFolder={folderInput.setText}
          onSubmit={start}
        />
      )}
    </Modal>
  );
}
