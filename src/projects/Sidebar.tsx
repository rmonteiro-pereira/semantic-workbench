/** Displays project files and validation status, keeping invalid files available for repair. */
import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  Folder,
  FolderGit2,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import type { ProjectFile, ProjectInfo } from './api';
// Project → files tree. Each file shows its document type and whether it passed validation;
// invalid files stay listed so they can be repaired in Source.
/** Names actions available from a project or file tree row. */
export type TreeAction =
  | {
      action:
        | 'rename'
        | 'import'
        | 'delete-project'
        | 'gitignore'
        | 'remote'
        | 'repository-projects';
      project: string;
    }
  | { action: 'move' | 'delete-file' | 'history'; project: string; path: string };
/** The note for files a person cannot open; plural only for more than one file. */
export function hiddenFilesLine(count: number) {
  return count === 1 ? '1 file you cannot open' : `${count} files you cannot open`;
}
// Per-item menu: a button that opens a list of menu items.
function ItemMenu({
  label,
  items,
}: {
  label: string;
  items: { label: string; run: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    root.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <span
      className="item-menu"
      ref={root}
      onKeyDown={e => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
          root.current?.querySelector<HTMLElement>('button')?.focus();
        }
      }}
    >
      <button
        className="item-menu-toggle"
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div role="menu" aria-label={`Actions for ${label}`} className="item-menu-list">
          {items.map(i => (
            <button
              key={i.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                i.run();
              }}
            >
              {i.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
// Direct delete on every row: same confirmation → undo → trash flow as the menu's Delete.
function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="row-action row-delete" aria-label={label} title={label} onClick={onClick}>
      <Trash2 size={15} aria-hidden="true" />
    </button>
  );
}
const typeLabel = (docType: string) =>
  docType === 'unknown' ? 'Unrecognized' : docType === 'gitignore' ? '.gitignore' : docType;
type TreeProps = {
  currentId?: string;
  onOpen: (project: string, path: string) => void;
  onAction: (action: TreeAction) => void;
  collapsed: Set<string>;
  toggle: (key: string) => void;
};

// Arrow keys fold and unfold a tree row, as in a file explorer.
function foldKeys(open: boolean, toggle: () => void) {
  return (e: React.KeyboardEvent) => {
    const wantsChange = (e.key === 'ArrowLeft' && open) || (e.key === 'ArrowRight' && !open);
    if (!wantsChange) return;
    e.preventDefault();
    toggle();
  };
}

function projectMenu(project: ProjectInfo, onAction: (action: TreeAction) => void) {
  const run = (action: Exclude<TreeAction, { path: string }>['action']) => () =>
    onAction({ action, project: project.slug });
  return [
    { label: 'Rename', run: run('rename') },
    { label: 'Import files into this project', run: run('import') },
    { label: 'Edit .gitignore', run: run('gitignore') },
    { label: 'Remote…', run: run('remote') },
    { label: 'Projects in this repository…', run: run('repository-projects') },
    { label: 'Delete', run: run('delete-project') },
  ];
}

function FileItem({
  project,
  file,
  currentId,
  onOpen,
  onAction,
}: { project: ProjectInfo; file: ProjectFile } & Omit<TreeProps, 'collapsed' | 'toggle'>) {
  const id = `${project.slug}/${file.path}`;
  const act = (action: 'history' | 'move' | 'delete-file') => () =>
    onAction({ action, project: project.slug, path: file.path });
  return (
    <li
      role="treeitem"
      aria-selected={currentId === id}
      aria-label={file.path}
      className={`project-file ${file.valid ? '' : 'invalid'}`}
    >
      <div className="tree-row file-row">
        <button
          className={`document ${currentId === id ? 'chosen' : ''}`}
          aria-label={file.path}
          title={file.path}
          onClick={() => onOpen(project.slug, file.path)}
        >
          <FileCode size={15} />
          <span title={file.path}>{file.path}</span>
        </button>
        <DeleteButton label={`Delete ${file.path}`} onClick={act('delete-file')} />
        <ItemMenu
          label={`${file.path} in ${project.name}`}
          items={[
            { label: 'History', run: act('history') },
            { label: 'Move', run: act('move') },
            { label: 'Delete', run: act('delete-file') },
          ]}
        />
      </div>
      <small className="file-meta">
        {typeLabel(file.docType)}
        {file.layout === 'embedded (deprecated)' && (
          <span title="Consolidated Ossie file: the ontology embeds its semantic model in ontology_mappings. Apache Ossie deprecates this layout in favour of split files.">
            {' '}
            · consolidated (deprecated upstream)
          </span>
        )}
        {!file.valid && <em className="file-invalid"> · invalid</em>}
        {file.gitState !== 'clean' && file.gitState !== 'unknown' && <> · {file.gitState}</>}
      </small>
    </li>
  );
}

function ProjectItem({ project, ...props }: { project: ProjectInfo } & TreeProps) {
  const open = !props.collapsed.has(project.slug);
  const toggle = () => props.toggle(project.slug);
  // A subfolder project names its folder, since the repository row above already names the
  // repository.
  const where = project.folder ? `${project.name} (${project.folder})` : project.name;
  return (
    <li role="treeitem" aria-expanded={open} aria-label={project.name} className="project">
      <div className="tree-row">
        <button
          className="project-toggle"
          title={where}
          aria-label={project.name}
          onClick={toggle}
          onKeyDown={foldKeys(open, toggle)}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {project.folder ? <Folder size={15} /> : <FolderGit2 size={15} />}
          <span title={where}>{project.name}</span>
          <small>{project.files.length}</small>
        </button>
        <DeleteButton
          label={`Delete project ${project.name}`}
          onClick={() => props.onAction({ action: 'delete-project', project: project.slug })}
        />
        <ItemMenu label={project.name} items={projectMenu(project, props.onAction)} />
      </div>
      {open && (
        <ul role="group">
          {project.hiddenFiles ? <li>{hiddenFilesLine(project.hiddenFiles)}</li> : null}
          {project.files.map(file => (
            <FileItem key={file.path} project={project} file={file} {...props} />
          ))}
        </ul>
      )}
    </li>
  );
}

// A repository that holds several projects: one row for the repository, its projects inside.
function RepositoryItem({
  repo,
  projects,
  ...props
}: { repo: string; projects: ProjectInfo[] } & TreeProps) {
  const key = 'repository:' + repo;
  const open = !props.collapsed.has(key);
  const toggle = () => props.toggle(key);
  const label = `Repository ${repo}`;
  return (
    <li role="treeitem" aria-expanded={open} aria-label={label} className="repository">
      <div className="tree-row">
        <button
          className="project-toggle"
          title={label}
          aria-label={label}
          onClick={toggle}
          onKeyDown={foldKeys(open, toggle)}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <FolderGit2 size={15} />
          <span title={label}>{repo}</span>
          <small>{projects.length}</small>
        </button>
        <ItemMenu
          label={label}
          items={[
            {
              label: 'Projects in this repository…',
              run: () =>
                props.onAction({ action: 'repository-projects', project: projects[0].slug }),
            },
          ]}
        />
      </div>
      {open && (
        <ul role="group">
          {projects.map(project => (
            <ProjectItem key={project.slug} project={project} {...props} />
          ))}
        </ul>
      )}
    </li>
  );
}

// Projects in tree order: a repository with subfolder projects becomes one group, placed where
// its first project was; every other project stays a top-level row.
function treeEntries(projects: ProjectInfo[]) {
  const byRepo = new Map<string, ProjectInfo[]>();
  for (const project of projects)
    byRepo.set(project.repo, [...(byRepo.get(project.repo) ?? []), project]);
  const entries: ({ repo: string; projects: ProjectInfo[] } | { project: ProjectInfo })[] = [];
  const placed = new Set<string>();
  for (const project of projects) {
    const members = byRepo.get(project.repo)!;
    if (!members.some(member => member.folder)) entries.push({ project: project });
    else if (!placed.has(project.repo)) {
      placed.add(project.repo);
      entries.push({ repo: project.repo, projects: members });
    }
  }
  return entries;
}

/** Renders project files with validation status and file actions. */
export function ProjectTree({
  projects,
  currentId,
  onOpen,
  onAction,
}: {
  projects: ProjectInfo[];
  currentId?: string;
  onOpen: (project: string, path: string) => void;
  onAction: (action: TreeAction) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) =>
    setCollapsed(old => {
      const next = new Set(old);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  if (!projects.length)
    return (
      <p className="projects-empty">No projects yet. Import definitions or load an example.</p>
    );
  const props = { currentId, onOpen, onAction, collapsed, toggle };
  return (
    <ul className="project-tree" role="tree" aria-label="Projects">
      {treeEntries(projects).map(entry =>
        'project' in entry ? (
          <ProjectItem key={entry.project.slug} project={entry.project} {...props} />
        ) : (
          <RepositoryItem key={'repository:' + entry.repo} {...entry} {...props} />
        ),
      )}
    </ul>
  );
}
