/** Confirms project or file deletion after showing affected files, unsaved edits and broken
 * references. */
import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { api, type Impact, type ProjectInfo } from './api';
// The confirmation names everything that is removed and warns about unsaved edits and references
// that will no longer resolve. Nothing is removed until the user presses the action button.
/** Identifies the project or file being considered for deletion. */
export type DeleteTarget =
  | { kind: 'file'; project: string; path: string }
  | { kind: 'project'; project: string }
  | { kind: 'clear' };

// A subfolder project whose repository holds other projects too: only then can it leave the
// workspace without its repository being left with no project.
const sharesRepository = (impact: Impact | null) =>
  !!impact?.subproject && (impact.sharedWith?.length ?? 0) > 0;

// What deleting the project moves to the trash, in words.
function deletedScope(impact: Impact) {
  if (sharesRepository(impact)) return 'its folder only';
  if (impact.subproject) return `the whole repository ${impact.repo}, including its Git history`;
  return 'including its Git history';
}

/** How a subfolder project leaves the workspace: unregistered only, or its folder trashed. */
type SubprojectMode = 'remove' | 'delete';

type Draft = { project: string; path: string };

function RemovedList({
  target,
  impact,
  projects,
  name,
}: {
  target: DeleteTarget;
  impact: Impact | null;
  projects: ProjectInfo[];
  name: (slug: string) => string;
}) {
  if (target.kind === 'clear')
    return (
      <>
        {projects.map(project => (
          <li key={project.slug}>
            {project.name} ({project.files.length} file{project.files.length === 1 ? '' : 's'})
          </li>
        ))}
      </>
    );
  if (target.kind === 'file')
    return (
      <li>
        {target.path} in {name(target.project)}
      </li>
    );
  if (!impact) return <li>Loading…</li>;
  const history = deletedScope(impact);
  return (
    <>
      <li>
        Project {impact.removes.name ?? name(target.project)}, {history}
      </li>
      {impact.removes.files.map(file => (
        <li key={file}>{file}</li>
      ))}
    </>
  );
}

// A subfolder project shares its repository with other projects, so taking it out of the
// workspace is the safe default; deleting its folder is a separate, explicit choice.
function SubprojectChoice({
  impact,
  mode,
  onChange,
  name,
}: {
  impact: Impact;
  mode: SubprojectMode;
  onChange: (mode: SubprojectMode) => void;
  name: (slug: string) => string;
}) {
  const siblings = (impact.sharedWith ?? []).map(name).join(', ');
  return (
    <fieldset className="subproject-choice">
      <legend>
        This project is a folder of the repository {impact.repo}
        {siblings && <>, shared with {siblings}</>}.
      </legend>
      <label className="check-row">
        <input
          type="radio"
          name="subproject-mode"
          checked={mode === 'remove'}
          onChange={() => onChange('remove')}
        />
        <span>
          <strong>Remove from workspace</strong>: the folder, its files and the history stay as they
          are.
        </span>
      </label>
      <label className="check-row">
        <input
          type="radio"
          name="subproject-mode"
          checked={mode === 'delete'}
          onChange={() => onChange('delete')}
        />
        <span>
          <strong>Delete folder</strong>: the folder moves to the trash and the repository shows its
          files as deleted until you commit.
        </span>
      </label>
    </fieldset>
  );
}

function UnsavedWarning({ unsaved, name }: { unsaved: Draft[]; name: (slug: string) => string }) {
  if (!unsaved.length) return null;
  return (
    <div role="alert" className="delete-warning">
      <strong>Unsaved edits will be lost:</strong>
      <ul>
        {unsaved.map((draft, index) => (
          <li key={index}>
            {draft.path} in {name(draft.project)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BrokenReferences({
  impact,
  name,
}: {
  impact: Impact | null;
  name: (slug: string) => string;
}) {
  if (!impact?.brokenReferences.length) return null;
  return (
    <div className="delete-warning">
      <strong>These references will no longer resolve:</strong>
      <ul>
        {impact.brokenReferences.map((broken, index) => (
          <li key={index}>
            {broken.from.path} ({name(broken.from.project)}) refers to "{broken.name}" in{' '}
            {broken.to.path}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Loads what a deletion affects: the impact of a file or project, or every draft for Clear.
function useDeletionImpact(target: DeleteTarget) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState('');
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
  return { impact, drafts, error, setError };
}

function dialogTitle(target: DeleteTarget, removing: boolean, name: (slug: string) => string) {
  if (target.kind === 'clear') return 'Clear workspace?';
  if (target.kind === 'file') return `Delete ${target.path}?`;
  const label = `project ${name(target.project)}`;
  return removing ? `Remove ${label} from the workspace?` : `Delete ${label}?`;
}

function dialogIntro(target: DeleteTarget, removing: boolean) {
  if (target.kind === 'clear')
    return 'Every project moves to the trash with its Git history. Projects that share a repository move together, as one entry.';
  if (removing) return 'Nothing on disk changes. You can add the folder back later.';
  return 'It moves to the trash; you can undo for 10 seconds and restore it from the trash later.';
}

type Props = {
  target: DeleteTarget;
  projects: ProjectInfo[];
  dirty: Draft | null;
  onCancel: () => void;
  onDeleted: (entryIds: string[], undoUntil: string, label: string) => void;
  onRemoved: (label: string) => void;
};

// Edits that would be lost: drafts of the removed files, and the open file's unsaved text.
function unsavedEdits(
  target: DeleteTarget,
  impact: Impact | null,
  drafts: Draft[],
  dirty: Draft | null,
) {
  const removed = (draft: Draft) =>
    target.kind === 'clear' ||
    (draft.project === target.project && (target.kind === 'project' || draft.path === target.path));
  const fromServer = impact?.unsavedDrafts ?? drafts.filter(removed);
  return dirty && removed(dirty) ? [...fromServer, dirty] : fromServer;
}

type Outcome =
  | { removed: true; label: string }
  | { removed: false; entryIds: string[]; undoUntil: string; label: string };

// Runs the confirmed action and says what happened, for the undo toast or the status line.
async function runDeletion(
  target: DeleteTarget,
  removing: boolean,
  name: (slug: string) => string,
): Promise<Outcome> {
  if (target.kind === 'file') {
    const result = await api.deleteFile(target.project, target.path);
    return {
      removed: false,
      entryIds: [result.entryId],
      undoUntil: result.undoUntil,
      label: target.path,
    };
  }
  if (target.kind === 'clear') {
    const result = await api.clear();
    const undoUntil = result.undoUntil ?? new Date().toISOString();
    return { removed: false, entryIds: result.entries, undoUntil, label: 'the workspace' };
  }
  const label = name(target.project);
  if (removing) {
    await api.removeProject(target.project);
    return { removed: true, label };
  }
  const result = await api.deleteProject(target.project);
  return { removed: false, entryIds: [result.entryId], undoUntil: result.undoUntil, label };
}

function actionText(removing: boolean, busy: boolean) {
  if (removing) return busy ? 'Removing…' : 'Remove from workspace';
  return busy ? 'Deleting…' : 'Delete';
}

/** Shows deletion impact and requires an explicit delete action. */
export function DeleteDialog({ target, projects, dirty, onCancel, onDeleted, onRemoved }: Props) {
  const { impact, drafts, error, setError } = useDeletionImpact(target);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<SubprojectMode>('remove');
  const name = (slug: string) => projects.find(project => project.slug === slug)?.name ?? slug;
  const shared = target.kind === 'project' && sharesRepository(impact);
  const removing = shared && mode === 'remove';
  const unsaved = removing ? [] : unsavedEdits(target, impact, drafts, dirty);

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const outcome = await runDeletion(target, removing, name);
      if (outcome.removed) onRemoved(outcome.label);
      else onDeleted(outcome.entryIds, outcome.undoUntil, outcome.label);
    } catch (e) {
      setError(`Nothing was ${removing ? 'removed' : 'deleted'}: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  const waiting = target.kind !== 'clear' && !impact && !error;
  return (
    <Modal title={dialogTitle(target, removing, name)} onCancel={onCancel}>
      <p>{dialogIntro(target, removing)}</p>
      {shared && impact && (
        <SubprojectChoice impact={impact} mode={mode} onChange={setMode} name={name} />
      )}
      {!removing && (
        <>
          <h3>Removed</h3>
          <ul className="delete-list">
            <RemovedList target={target} impact={impact} projects={projects} name={name} />
          </ul>
        </>
      )}
      <UnsavedWarning unsaved={unsaved} name={name} />
      {!removing && <BrokenReferences impact={impact} name={name} />}
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
          className={removing ? 'primary' : 'danger'}
          onClick={confirm}
          disabled={busy || waiting}
        >
          {actionText(removing, busy)}
        </button>
      </div>
    </Modal>
  );
}
