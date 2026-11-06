/** One group of changed files (conflicts, staged or unstaged) in Source Control, with a row per file. */
import { EyeOff, FileCode, Minus, Plus } from 'lucide-react';
import type { useCapabilities } from '../auth/Capabilities';
import type { GitChange } from '../projects/api';
import { IgnoreChooser } from './IgnoreChooser';

export type Group = 'conflicts' | 'staged' | 'changes';
export type Selection = { path: string; group: Group } | null;

const STATE: Record<string, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
  T: 'Type changed',
  U: 'Conflicted',
  '?': 'Untracked',
};
const letter = (change: GitChange, group: Group) => {
  if (group === 'conflicts') {
    return '!';
  }
  if (group === 'staged') {
    return change.index;
  }
  if (change.untracked) {
    return 'U';
  }
  return change.worktree;
};

type RowProps = {
  gitChange: GitChange;
  group: Group;
  project: string;
  selected: Selection;
  ignoring: string | null;
  busy: boolean;
  access: ReturnType<typeof useCapabilities>;
  onSelect: (gitChange: GitChange, group: Group) => void;
  onOpen: (project: string, path: string) => void;
  onStage: (gitChange: GitChange, staged: boolean) => void;
  onToggleIgnore: (path: string) => void;
  onCancelIgnore: () => void;
  onIgnore: (pattern: string) => void;
};

function ChangeRow({ gitChange, group, project, selected, ignoring, busy, access, onSelect, onOpen, onStage, onToggleIgnore, onCancelIgnore, onIgnore }: RowProps) {
  const isSel = selected?.path === gitChange.repoPath && selected.group === group;
  const statusLetter = letter(gitChange, group);
  const name = gitChange.path.split('/').pop()!;
  const folder = gitChange.path.slice(0, -name.length).replace(/\/$/, '');
  const openInEditor = () => onOpen(gitChange.project ?? project, gitChange.projectPath ?? gitChange.path);
  return (
    <li className={`scm-row${isSel ? ' selected' : ''}${gitChange.hidden ? ' hidden-file' : ''}`}>
      <button
        className="scm-file"
        aria-label={`${gitChange.path}, ${group === 'conflicts' ? 'conflicted' : (STATE[statusLetter] ?? statusLetter)}${gitChange.hidden ? ', not shown in workspace' : ''}`}
        aria-pressed={isSel}
        onClick={() => onSelect(gitChange, group)}
      >
        <span className="scm-name">{name}</span>
        {folder && <small>{folder}</small>}
        {gitChange.orig && <small>← {gitChange.orig}</small>}
        {gitChange.hidden && (
          <em className="scm-label" title="This file type is not shown in the workspace; it can be diffed, staged and committed here, not edited.">
            <EyeOff size={11} />
            {gitChange.label}
          </em>
        )}
      </button>
      <span className="scm-actions">
        {!gitChange.hidden && gitChange.project && !(group === 'staged' && gitChange.index === 'D') && gitChange.worktree !== 'D' && (
          <button aria-label={`Open ${gitChange.path}`} title="Open in the editor" onClick={openInEditor}>
            <FileCode size={13} />
          </button>
        )}
        {group === 'changes' && !gitChange.outside && access.can('edit', gitChange.project ?? project) && (
          <button aria-label={`Add ${gitChange.path} to .gitignore`} title="Add to .gitignore" onClick={() => onToggleIgnore(gitChange.path)}>
            <EyeOff size={13} />
          </button>
        )}
        {group === 'staged' ? (
          <button
            aria-label={`Unstage ${gitChange.path}`}
            title={access.control('stage').title ?? 'Unstage'}
            onClick={() => onStage(gitChange, false)}
            disabled={busy || !access.can('stage', gitChange.project ?? project)}
          >
            <Minus size={13} />
          </button>
        ) : (
          <button
            aria-label={`Stage ${gitChange.path}`}
            title={access.control('stage').title ?? (group === 'conflicts' ? 'Mark as resolved (stage)' : 'Stage')}
            onClick={() => onStage(gitChange, true)}
            disabled={busy || !access.can('stage', gitChange.project ?? project)}
          >
            <Plus size={13} />
          </button>
        )}
      </span>
      <span className={`scm-state s-${statusLetter === '?' ? 'u' : statusLetter.toLowerCase()}`} title={STATE[statusLetter] ?? statusLetter}>
        {statusLetter}
      </span>
      {ignoring === gitChange.path && <IgnoreChooser path={gitChange.path} onCancel={onCancelIgnore} onAdd={onIgnore} />}
    </li>
  );
}

type GroupProps = Omit<RowProps, 'gitChange'> & {
  title: string;
  items: GitChange[];
  all?: { label: string; run: () => void };
};

export function ChangeGroup({ title, items, all, ...rowProps }: GroupProps) {
  if (items.length === 0) return null;
  const { busy, access, group } = rowProps;
  return (
    <section className="scm-group" aria-label={title}>
      <h3>
        <span>{title}</span>
        <small>{items.length}</small>
        {all && (
          <button className="link" onClick={all.run} disabled={busy || !access.can('stage')}>
            {all.label}
          </button>
        )}
      </h3>
      <ul>
        {items.map(gitChange => (
          <ChangeRow key={group + gitChange.repoPath} gitChange={gitChange} {...rowProps} />
        ))}
      </ul>
    </section>
  );
}
