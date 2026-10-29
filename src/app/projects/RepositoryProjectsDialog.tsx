/** Dialog that chooses which folders of a Git repository are projects in the workspace. */
import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { api, type ProjectCandidates, type RepositoryProject } from './api';

type Row = { path: string; files?: number; checked: boolean; name: string; defaultName: string };

const ROOT_LABEL = 'The whole repository as one project';

const baseName = (path: string, repo: string) => path.split('/').pop() || repo;

/** Which folders start checked: the current projects, or what the repository proposes. */
export type StartingChoice = 'current' | 'proposed';

// The registered folders, or, right after a clone, the manifest's folders else the detected ones.
function initialChoice(found: ProjectCandidates, start: StartingChoice) {
  if (start === 'current' && found.registered.length) return new Set(found.registered.map(project => project.path));
  if (found.manifest) return new Set(found.manifest.projects.map(entry => entry.path));
  if (found.detected.length) return new Set(found.detected.map(folder => folder.path));
  return new Set(found.registered.map(project => project.path));
}

// One row per folder the repository offers: the root, the manifest's folders, the detected
// folders and the folders already registered.
function rowsFrom(found: ProjectCandidates, repo: string, start: StartingChoice): Row[] {
  const registered = new Map(found.registered.map(project => [project.path, project.name]));
  const declared = new Map((found.manifest?.projects ?? []).map(entry => [entry.path, entry.name]));
  const files = new Map(found.detected.map(folder => [folder.path, folder.files]));
  const paths = new Set(['', ...declared.keys(), ...files.keys(), ...registered.keys()]);
  const chosen = initialChoice(found, start);
  return [...paths].sort().map(path => {
    const name = registered.get(path) ?? declared.get(path) ?? '';
    return {
      path,
      files: files.get(path),
      checked: chosen.has(path),
      name,
      defaultName: name || baseName(path, repo),
    };
  });
}

// The root and its subfolders cannot both be projects: checking one side clears the other.
function toggleRow(rows: Row[], path: string, checked: boolean) {
  return rows.map(row => {
    if (row.path === path) return { ...row, checked };
    if (!checked) return row;
    const conflicts = path === '' || row.path === '';
    return conflicts ? { ...row, checked: false } : row;
  });
}

function chosenProjects(rows: Row[]): RepositoryProject[] {
  return rows.filter(row => row.checked).map(row => (row.name.trim() ? { path: row.path, name: row.name.trim() } : { path: row.path }));
}

function FolderRow({ row, onToggle, onRename }: { row: Row; onToggle: (checked: boolean) => void; onRename: (name: string) => void }) {
  const label = row.path || ROOT_LABEL;
  return (
    <li className="repository-folder">
      <label className="check-row">
        <input type="checkbox" checked={row.checked} onChange={e => onToggle(e.target.checked)} />
        <span className={row.path ? 'repository-folder-path' : undefined}>{label}</span>
        {row.files !== undefined && (
          <small>
            {row.files} definition file{row.files === 1 ? '' : 's'}
          </small>
        )}
      </label>
      {row.checked && <input aria-label={`Project name for ${label}`} value={row.name} maxLength={200} placeholder={row.defaultName} onChange={e => onRename(e.target.value)} />}
    </li>
  );
}

// Reads what the repository offers and keeps the editable rows.
function useRepositoryFolders(repo: string, start: StartingChoice) {
  const [found, setFound] = useState<ProjectCandidates | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  async function load() {
    try {
      const candidates = await api.projectCandidates(repo);
      setFound(candidates);
      setRows(rowsFrom(candidates, repo, start));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [repo]);
  return { found, rows, setRows, error, setError, load };
}

// A manifest lists subfolders only, so it cannot record the whole repository as one project.
function ManifestChoice(props: { checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="check-row">
      <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={e => props.onChange(e.target.checked)} />
      <span>Save as .semantic-workbench.json in the repository; commit it to share the choice</span>
    </label>
  );
}

function DialogFooter(props: { busy: boolean; canSave: boolean; onCancel: () => void; onSave: () => void }) {
  return (
    <>
      <span className="dialog-footer-spacer" />
      <button type="button" onClick={props.onCancel} disabled={props.busy}>
        Cancel
      </button>
      <button type="button" className="primary" disabled={props.busy || !props.canSave} onClick={props.onSave}>
        {props.busy ? 'Saving…' : 'Save projects'}
      </button>
    </>
  );
}

type Props = {
  repo: string;
  start?: StartingChoice;
  onClose: () => void;
  onSaved: (slugs: string[]) => void;
};

/** Lets the user choose a repository's project folders, and optionally save them as a manifest. */
export function RepositoryProjectsDialog({ repo, start = 'current', onClose, onSaved }: Props) {
  const { found, rows, setRows, error, setError, load } = useRepositoryFolders(repo, start);
  const [saveManifest, setSaveManifest] = useState(false);
  const [busy, setBusy] = useState(false);
  const projects = chosenProjects(rows);
  const rootChosen = projects.some(project => project.path === '');

  async function save() {
    setBusy(true);
    setError('');
    try {
      const manifest = saveManifest && !rootChosen ? { baseHash: found!.manifestHash } : undefined;
      const result = await api.setRepositoryProjects(repo, projects, manifest);
      onSaved(result.projects.map(project => project.slug));
    } catch (e: any) {
      if (e.status === 409) {
        setError('The manifest changed in the repository. The list now shows the saved version.');
        await load();
      } else setError(e.message);
      setBusy(false);
    }
  }

  const footer = <DialogFooter busy={busy} canSave={!!found && projects.length > 0} onCancel={onClose} onSave={() => void save()} />;

  return (
    <Modal title={`Projects in ${repo}`} onCancel={busy ? () => {} : onClose} footer={footer} className="repository-projects">
      <p className="dialog-intro">
        Each chosen folder becomes a project. All of them share this repository's Source Control, branch and history. Leaving a folder out removes its project from the workspace; no file is deleted.
      </p>
      {found?.manifestError && (
        <p role="alert" className="dialog-error">
          The repository's .semantic-workbench.json was not used: {found.manifestError}
        </p>
      )}
      {!found && !error && <p role="status">Reading the repository…</p>}
      {found && (
        <ul className="repository-folders" aria-label="Folders">
          {rows.map(row => (
            <FolderRow
              key={row.path}
              row={row}
              onToggle={checked => setRows(old => toggleRow(old, row.path, checked))}
              onRename={name => setRows(old => old.map(item => (item.path === row.path ? { ...item, name } : item)))}
            />
          ))}
        </ul>
      )}
      {found && <ManifestChoice checked={saveManifest && !rootChosen} disabled={rootChosen} onChange={setSaveManifest} />}
      {error && (
        <p role="alert" className="dialog-error">
          {error}
        </p>
      )}
    </Modal>
  );
}
