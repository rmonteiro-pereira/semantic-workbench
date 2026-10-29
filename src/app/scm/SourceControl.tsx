/** Displays project changes, diffs, history and explicit Git actions with progress and
 * cancellation. */
import { useCapabilities } from '../auth/Capabilities';
import { useGitSetup } from './GitSetup';
import { ScmError } from './ScmError';
import { isPublished, trackingLine, upstreamRemote } from './branch-tracking';
import { cleanTreeText } from './empty-repository';
import { EmptyState } from '../projects/EmptyState';
import { ConnectPrompt, actionTitle, connectRequired, useResumeAfterConnect, type RemoteAction } from './RemoteConnectPrompt';
import type { ConnectKind } from '../auth/ConnectedAccounts';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Check, EyeOff, FileCode, GitCommit, History, Minus, Plus, RefreshCw, X } from 'lucide-react';
import { scm, Blocked, type GitChange, type GitCommit as Commit, type GitDiff, type GitStatus, type ProjectInfo, type RemoteResult, type FollowResult } from '../projects/api';
import { DiffView } from './DiffView';
import { BranchPicker } from './BranchPicker';
import { SyncDialog } from './SyncDialog';
import { RemoteActions } from './RemoteActions';
import { ignoreChoices } from '../../shared/scm/gitignore';
import { changesOfProject, elsewhereLine } from './project-changes';
import './scm.css';

/** Names the remote, branch and folder a sparse project lives in. */
export function repositoryLocation(status: Pick<GitStatus, 'upstream' | 'remotes' | 'branch' | 'folder'>): string {
  const remote = upstreamRemote(status) ?? 'no remote';
  return [remote, status.branch, status.folder].filter(Boolean).join(' · ');
}

// Changes include diffs, staging, branches, history and explicit remote actions. Hidden-type files
// remain read-only; remote actions expose progress and cancellation.
type Group = 'conflicts' | 'staged' | 'changes';
type Selection = { path: string; group: Group } | null;
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
/** The commit counts a finished Git action left to push and to pull, when there are any. */
function aheadBehind(counts: { ahead?: number; behind?: number }): string {
  if (!counts.ahead && !counts.behind) return '';
  return ` · ${counts.ahead} to push, ${counts.behind} to pull`;
}

/** The history note for commits that touch only files the person cannot open. */
export function hiddenCommitsLine(count: number) {
  return count === 1 ? '1 commit with changes you cannot open' : `${count} commits with changes you cannot open`;
}
function groupsOf(changes: GitChange[]) {
  return {
    conflicts: changes.filter(c => c.conflicted),
    staged: changes.filter(c => !c.conflicted && !c.untracked && c.index !== '.'),
    changes: changes.filter(c => !c.conflicted && (c.untracked || c.worktree !== '.')),
  };
}
// Which two versions a change compares, as VS Code does: staged = last commit → index; changes =
// index → working tree; conflicts = last commit → working tree (with the markers).
const rangeOf = (group: Group, gitChange: GitChange) => {
  if (group === 'staged') {
    return ['HEAD', 'index'];
  }
  if (group === 'conflicts') {
    return ['HEAD', 'worktree'];
  }
  if (gitChange.untracked) {
    return ['index', 'worktree'];
  }
  return ['index', 'worktree'];
};
// The versions to compare after the history reloads. A reload (a commit, a pull, a file event)
// keeps the two versions the user picked while both are still in the history; otherwise it
// compares the last two commits, or the last commit with the working tree.
function historyRange(previous: { from: string; to: string } | null, log: Commit[]) {
  if (!log.length) return null;
  const known = (commit: string) => commit === 'worktree' || log.some(entry => entry.commit === commit);
  if (previous && known(previous.from) && known(previous.to)) return previous;
  return {
    from: log[Math.min(1, log.length - 1)].commit,
    to: log.length > 1 ? log[0].commit : 'worktree',
  };
}
// `onBusy` tells the editor that a pull, sync or branch switch runs (automatic saving waits);
// `onCommit` opens the Commit dialog, offered when a pull, sync or switch is refused.
type Props = {
  projects: ProjectInfo[];
  project: string;
  version: number;
  unsaved: string[];
  historyPath?: string;
  onOpen: (project: string, path: string) => void;
  onChanged: () => void;
  onBusy?: (busy: boolean) => void;
  onCommit?: () => void;
};
/** Displays project Git changes and actions with progress and cancellation. */
export function SourceControl({ projects, project, version, unsaved, historyPath, onOpen, onChanged, onBusy, onCommit }: Props) {
  const access = useCapabilities(project);
  // Remotes are managed by Admins only, and the project's own rules can still refuse the change.
  const canManageRemotes = access.admin && access.can('setRemote');
  // Server mode: the person's own working copy of this project's repository.
  const copy = projects.find(listed => listed.slug === project)?.copy ?? null;
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [error, setError] = useState('');
  // Kept apart from action errors: reloading the status after a failed push must not hide why it
  // failed.
  const [loadError, setLoadError] = useState('');
  const [note, setNote] = useState<{
    tone: 'info' | 'warning';
    text: string;
    paths?: string[];
    commit?: boolean;
  } | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const [diff, setDiff] = useState<GitDiff | null>(null);
  const [message, setMessage] = useState('');
  const [waiting, setWaiting] = useState<string | null>(null);
  // A remote action refused until the person connects their own account for that remote.
  const [connect, setConnect] = useState<{ kind: ConnectKind; action: RemoteAction } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ignoring, setIgnoring] = useState<string | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const openGitSetup = useGitSetup();
  const [historyFile, setHistoryFile] = useState<string | undefined>(historyPath);
  const [log, setLog] = useState<Commit[]>([]);
  const [hiddenCommits, setHiddenCommits] = useState(0);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const local = useRef(0);
  const [tick, setTick] = useState(0);
  const reload = () => setTick(t => t + 1);
  useResumeAfterConnect(project, status !== null, action => void remote(action));
  useEffect(() => {
    setSelected(null);
    setDiff(null);
    setNote(null);
    setConnect(null);
    setError('');
    setLoadError('');
    setHistoryFile(historyPath);
  }, [project]);
  useEffect(() => {
    if (historyPath) {
      setHistoryFile(historyPath);
      setSelected(null);
    }
  }, [historyPath]);
  useEffect(() => {
    let live = true;
    scm
      .status(project)
      .then(gitStatus => {
        if (live) {
          setStatus(gitStatus);
          setLoadError('');
        }
      })
      .catch(e => {
        if (live) setLoadError(e.message);
      });
    return () => {
      live = false;
    };
  }, [project, version, tick]);
  // Feedback names a remote action; it stops describing the project once the remote changes.
  const remoteSignature = status ? JSON.stringify(status.remotes) : null;
  const previousRemotes = useRef<string | null>(null);
  useEffect(() => {
    const changed = previousRemotes.current !== null && previousRemotes.current !== remoteSignature;
    previousRemotes.current = remoteSignature;
    if (!changed) return;
    setNote(null);
    setError('');
  }, [remoteSignature]);
  const scoped = useMemo(() => changesOfProject(status?.changes ?? []), [status]);
  const groups = useMemo(() => groupsOf(scoped.inProject), [scoped]);
  // Selections name the file from the repository root: two projects may hold the same path.
  const change = selected && status?.changes.find(c => c.repoPath === selected.path);
  // The diff of the selected change; it follows the file as it changes.
  useEffect(() => {
    if (!selected || !change) {
      setDiff(null);
      return;
    }
    const [from, to] = rangeOf(selected.group, change);
    let live = true;
    scm
      .changeDiff(project, selected.path, from, to)
      .then(d => {
        if (live) setDiff(d);
      })
      .catch(e => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [selected?.path, selected?.group, status]);
  useEffect(() => {
    let live = true;
    scm
      .log(project, historyFile, 50)
      .then(history => {
        if (live) {
          setLog(history.commits);
          setHiddenCommits(history.hiddenCommits);
          setRange(previous => (historyFile ? historyRange(previous, history.commits) : null));
        }
      })
      .catch(() => {
        if (live) {
          setLog([]);
          setHiddenCommits(0);
        }
      });
    return () => {
      live = false;
    };
  }, [project, historyFile, version, tick]);
  const [versions, setVersions] = useState<GitDiff | null>(null);
  useEffect(() => {
    if (!historyFile || !range || selected) {
      setVersions(null);
      return;
    }
    let live = true;
    scm
      .diff(project, historyFile, range.from, range.to)
      .then(d => {
        if (live) setVersions(d);
      })
      .catch(e => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [historyFile, range?.from, range?.to, selected, version, tick]);
  async function act<T>(run: () => Promise<T>, done?: (value: T) => void) {
    setBusy(true);
    setError('');
    setNote(null);
    try {
      const value = await run();
      done?.(value);
    } catch (error) {
      if (error instanceof Blocked)
        setNote({
          tone: 'warning',
          text:
            error.reason === 'drafts'
              ? 'These files have edits that are not saved to file yet (repair them in Source, or discard them), then commit:'
              : 'Commit or discard these changes first (nothing is stashed automatically):',
          paths: error.paths,
          commit: true,
        });
      else setError((error as Error).message);
    } finally {
      setBusy(false);
      reload();
      onChanged();
    }
  }
  const altered = (paths: string[], what: string) =>
    paths.length
      ? setNote({
          tone: 'warning',
          text: `A Git hook or filter changed these files during the ${what}; their bytes on disk differ from what was saved or committed:`,
          paths,
        })
      : undefined;
  function guard(kind: string) {
    if (unsaved.length) {
      setNote({
        tone: 'warning',
        text: `These edits are not saved to file yet; let them save (or repair them) and commit before you ${kind}:`,
        paths: unsaved,
        commit: true,
      });
      return false;
    }
    return true;
  }
  // A missing account is not a failure: the panel asks for it and keeps the action to continue.
  async function remoteOrConnect(action: RemoteAction) {
    setConnect(null);
    try {
      return await scm.remote(project, action);
    } catch (problem) {
      const kind = connectRequired(problem);
      if (!kind) throw problem;
      setConnect({ kind, action });
      return null;
    }
  }
  // A fetch found the remote's default branch ahead but left the published one where it is.
  function behindText(follow: FollowResult) {
    const behind = `${follow.branch} is behind ${follow.remote}`;
    if (follow.reason === 'guard') return `${behind}: its new commits hold changes only a Steward or Admin may bring in.`;
    return `${behind}; someone with publish must bring it in.`;
  }
  function reportRemote(action: string, remoteResult: RemoteResult) {
    if (remoteResult.cancelled) setNote({ tone: 'info', text: `${actionTitle(action)} cancelled.` });
    else if (remoteResult.conflicted.length)
      setNote({
        tone: 'warning',
        text: 'The pull stopped on conflicts. Open each file, repair it, stage it, then commit the merge:',
        paths: remoteResult.conflicted,
      });
    else if (!remoteResult.ok) setError(remoteResult.stderr || `${actionTitle(action)} failed.`);
    else if (remoteResult.follow && !remoteResult.follow.followed) setNote({ tone: 'warning', text: behindText(remoteResult.follow) });
    else if (remoteResult.altered.length) altered(remoteResult.altered, action);
    else
      setNote({
        tone: 'info',
        text: `${actionTitle(action)} finished${aheadBehind(remoteResult)}.`,
      });
  }
  async function remote(action: RemoteAction) {
    if ((action === 'pull' || action === 'sync') && !guard(action)) return;
    const id = ++local.current;
    setWaiting(action);
    onBusy?.(action !== 'fetch' && action !== 'push');
    try {
      await act(
        () => remoteOrConnect(action),
        (r: RemoteResult | null) => {
          if (r) reportRemote(action, r);
        },
      );
    } finally {
      onBusy?.(false);
    }
    if (local.current === id) setWaiting(null);
  }
  // Server mode: the person's copy takes the published branch in, or publishes to it.
  function pullDefault() {
    if (!guard('pull')) return;
    void act(
      () => scm.pullDefault(project),
      r => reportRemote('pull', r),
    );
  }
  function pushDefault() {
    void act(
      () => scm.pushDefault(project),
      r => reportRemote('push', r),
    );
  }
  function publishCopy() {
    void act(
      () => scm.publish(project),
      r => setNote({ tone: 'info', text: `Published to ${r.published}.` }),
    );
  }
  const switchTo = (branch: string, create: boolean) => {
    if (!guard('switch branches')) return;
    onBusy?.(true);
    void act(
      () => scm.switch(project, branch, create),
      switched => {
        setSelected(null);
        if (switched.altered.length) altered(switched.altered, 'switch');
        else
          setNote({
            tone: 'info',
            text: `${create ? 'Created and switched to' : 'Switched to'} ${switched.branch}.`,
          });
      },
    ).finally(() => onBusy?.(false));
  };
  const commit = () =>
    act(
      () => scm.commit(project, message),
      committed => {
        setMessage('');
        setSelected(null);
        if (committed.altered.length) altered(committed.altered, 'commit');
        else setNote({ tone: 'info', text: `Committed ${committed.commit.slice(0, 7)}.` });
      },
    );
  if ((loadError || error) && !status)
    return (
      <section className="scm scm-message" aria-label="Source Control">
        <p role="alert" className="scm-error">
          {loadError || error}
        </p>
      </section>
    );
  if (!status)
    return (
      <section className="scm scm-message" aria-label="Source Control">
        <p className="scm-empty">Loading Source Control…</p>
      </section>
    );
  if (!status.gitAvailable)
    return (
      <section className="scm scm-message" aria-label="Source Control">
        <div role="alert" className="scm-note warning">
          <AlertTriangle size={14} />
          <span>Git was not found on this machine, so this project has no version control here. Editing, validation and export keep working. Install Git 2.40 or newer and restart the workbench.</span>
        </div>
      </section>
    );
  const remoteNames = Object.keys(status.remotes);
  // The dialog holds only the published-branch actions of a server working copy.
  const offersSync = copy !== null;
  function fromSync(run: () => void) {
    setSyncOpen(false);
    run();
  }
  const canCommit = access.can('commit') && !!message.trim() && (groups.staged.length > 0 || status.merging) && !groups.conflicts.length && status.identityConfigured && !busy;
  const row = (gitChange: GitChange, group: Group) => {
    const isSel = selected?.path === gitChange.repoPath && selected.group === group;
    const statusLetter = letter(gitChange, group);
    const name = gitChange.path.split('/').pop()!;
    const folder = gitChange.path.slice(0, -name.length).replace(/\/$/, '');
    const openInEditor = () => onOpen(gitChange.project ?? project, gitChange.projectPath ?? gitChange.path);
    return (
      <li key={group + gitChange.repoPath} className={`scm-row${isSel ? ' selected' : ''}${gitChange.hidden ? ' hidden-file' : ''}`}>
        <button
          className="scm-file"
          aria-label={`${gitChange.path}, ${group === 'conflicts' ? 'conflicted' : (STATE[statusLetter] ?? statusLetter)}${gitChange.hidden ? ', not shown in workspace' : ''}`}
          aria-pressed={isSel}
          onClick={() => {
            setSelected({ path: gitChange.repoPath, group });
            setHistoryFile(gitChange.outside ? undefined : gitChange.path);
          }}
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
            <button aria-label={`Add ${gitChange.path} to .gitignore`} title="Add to .gitignore" onClick={() => setIgnoring(ignoring === gitChange.path ? null : gitChange.path)}>
              <EyeOff size={13} />
            </button>
          )}
          {group === 'staged' ? (
            <button
              aria-label={`Unstage ${gitChange.path}`}
              title={access.control('stage').title ?? 'Unstage'}
              onClick={() => act(() => scm.stageChanges(project, [gitChange.repoPath], false))}
              disabled={busy || !access.can('stage', gitChange.project ?? project)}
            >
              <Minus size={13} />
            </button>
          ) : (
            <button
              aria-label={`Stage ${gitChange.path}`}
              title={access.control('stage').title ?? (group === 'conflicts' ? 'Mark as resolved (stage)' : 'Stage')}
              onClick={() => act(() => scm.stageChanges(project, [gitChange.repoPath], true))}
              disabled={busy || !access.can('stage', gitChange.project ?? project)}
            >
              <Plus size={13} />
            </button>
          )}
        </span>
        <span className={`scm-state s-${statusLetter === '?' ? 'u' : statusLetter.toLowerCase()}`} title={STATE[statusLetter] ?? statusLetter}>
          {statusLetter}
        </span>
        {ignoring === gitChange.path && (
          <IgnoreChooser
            path={gitChange.path}
            onCancel={() => setIgnoring(null)}
            onAdd={pattern =>
              act(
                () => scm.ignore(project, pattern),
                ignored => {
                  setIgnoring(null);
                  setSelected(null);
                  setNote(
                    ignored.tracked.length
                      ? {
                          tone: 'warning',
                          text: `Added ${pattern} to .gitignore. These files are already committed, so Git keeps tracking them until they are removed from the repository (git rm --cached):`,
                          paths: ignored.tracked,
                        }
                      : {
                          tone: 'info',
                          text: ignored.added ? `Added ${pattern} to .gitignore.` : `${pattern} was already in .gitignore.`,
                        },
                  );
                },
              )
            }
          />
        )}
      </li>
    );
  };
  const section = (group: Group, title: string, items: GitChange[], all?: { label: string; run: () => void }) =>
    items.length > 0 && (
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
        <ul>{items.map(c => row(c, group))}</ul>
      </section>
    );
  let mainPane: React.ReactNode;
  if (selected && diff) {
    if (diff.binary) {
      mainPane = <p className="scm-empty">{diff.path} is a binary file; it can be staged and committed, but not shown.</p>;
    } else {
      mainPane = (
        <DiffView
          label={`Changes in ${diff.path}`}
          filename={diff.path}
          before={diff.before}
          after={diff.after}
          beforeLabel={`${diff.path} · ${diff.beforeExists ? versionName(diff.from) : 'new file'}`}
          afterLabel={diff.afterExists ? versionName(diff.to) : 'Deleted'}
        />
      );
    }
  } else if (historyFile && range && versions) {
    mainPane = (
      <>
        <div className="scm-versions" role="group" aria-label="Compare versions">
          <label>
            <span>From</span>
            <select aria-label="From version" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })}>
              {log.map(gitCommit => (
                <option key={gitCommit.commit} value={gitCommit.commit}>
                  {gitCommit.commit.slice(0, 7)} {gitCommit.message}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>To</span>
            <select aria-label="To version" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })}>
              <option value="worktree">Working tree</option>
              {log.map(gitCommit => (
                <option key={gitCommit.commit} value={gitCommit.commit}>
                  {gitCommit.commit.slice(0, 7)} {gitCommit.message}
                </option>
              ))}
            </select>
          </label>
        </div>
        {versions.binary ? (
          <p className="scm-empty">Binary file.</p>
        ) : (
          <DiffView
            label={`Versions of ${historyFile}`}
            filename={historyFile}
            before={versions.before}
            after={versions.after}
            beforeLabel={`${historyFile} · ${versionName(range.from, log)}`}
            afterLabel={versionName(range.to, log)}
          />
        )}
      </>
    );
  } else {
    mainPane = <EmptyState title="No file selected">Select a changed file to see its diff, or a file's history to compare two of its versions.</EmptyState>;
  }
  return (
    <section className="scm" aria-label="Source Control">
      <div className="scm-side">
        <h2 className="scm-title">Source control</h2>
        <div className="scm-head">
          <BranchPicker project={project} current={status.branch} version={version + tick} disabled={busy || !access.can('branch')} inUse={copy?.inUseBranches} onSwitch={switchTo} />
          <SyncCounters status={status} />
          {offersSync && (
            <button className="scm-sync-open" onClick={() => setSyncOpen(true)}>
              <RefreshCw size={13} />
              Sync…
            </button>
          )}
        </div>
        <div className="scm-remote">
          {remoteNames.length ? (
            <span className="scm-remote-url" title={status.remotes[remoteNames[0]]}>
              {remoteNames[0]}: {status.remotes[remoteNames[0]]}
            </span>
          ) : (
            <span className="scm-remote-url">No remote yet. Add one to push and pull.</span>
          )}
          <button hidden={!canManageRemotes} onClick={() => openGitSetup({ kind: 'remote', project })}>
            Remote…
          </button>
          {remoteNames.length > 0 && <RemoteActions status={status} busy={busy} can={access.can} onRemoteAction={action => void remote(action)} />}
        </div>
        <p className="scm-tracking">{trackingLine(status.upstream)}</p>
        {status.folder && (
          <p className="scm-where" aria-label="Repository location">
            {repositoryLocation(status)}
          </p>
        )}
        {waiting && (
          <div role="status" className="scm-note waiting">
            <span className="spinner" aria-hidden />
            <span>{access.local ? 'Waiting for Git (credentials may be requested in a separate window)…' : 'Waiting for Git…'}</span>
            <button hidden={!access.can('cancelOwn')} onClick={() => void scm.cancel(project)}>
              Cancel
            </button>
          </div>
        )}
        {note && (
          <div role={note.tone === 'warning' ? 'alert' : 'status'} className={`scm-note ${note.tone}`}>
            {note.tone === 'warning' ? <AlertTriangle size={14} /> : <Check size={14} />}
            <div>
              <span>{note.text}</span>
              {note.paths && (
                <ul>
                  {note.paths.map(path => (
                    <li key={path}>
                      <code>{path}</code>
                    </li>
                  ))}
                </ul>
              )}
              {note.commit && onCommit && (
                <button className="scm-note-action" onClick={onCommit}>
                  Commit…
                </button>
              )}
            </div>
            <button aria-label="Dismiss" onClick={() => setNote(null)}>
              <X size={13} />
            </button>
          </div>
        )}
        {connect && <ConnectPrompt kind={connect.kind} project={project} action={connect.action} onDismiss={() => setConnect(null)} />}
        {error && (
          <ScmError
            message={error}
            canOpenGuide={access.local}
            busy={busy}
            onOpenGuide={() =>
              openGitSetup({
                kind: 'credentials',
                remote: status.remotes[upstreamRemote(status) ?? ''],
              })
            }
            onPull={() => void remote('pull')}
          />
        )}
        {status.merging && !note && (
          <p className="scm-note warning">
            <AlertTriangle size={14} />
            <span>A merge is in progress. Repair each conflicted file in Source, stage it, then commit.</span>
          </p>
        )}
        <div className="scm-commit">
          <textarea
            aria-label="Commit message"
            placeholder={`Message (commit on ${status.branch})`}
            rows={2}
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && canCommit) {
                event.preventDefault();
                void commit();
              }
            }}
          />
          <button className="primary" onClick={() => void commit()} disabled={!canCommit} title={access.control('commit').title ?? 'Commit (Ctrl+Enter)'}>
            <GitCommit size={14} />
            Commit to {status.branch}
          </button>
          {access.local && !status.identityConfigured && (
            <small>
              Git has no user.name or user.email, so commits are not possible yet.{' '}
              <button className="link" onClick={() => openGitSetup({ kind: 'identity', project })}>
                Set Git identity…
              </button>
            </small>
          )}
        </div>
        {!scoped.inProject.length && <p className="scm-empty">{status.changes.length ? 'No changes in this project.' : cleanTreeText(status)}</p>}
        {scoped.elsewhere > 0 && <p className="scm-elsewhere">{elsewhereLine(scoped.elsewhere)}</p>}
        {section('conflicts', 'Merge conflicts', groups.conflicts)}
        {section('staged', 'Staged changes', groups.staged, {
          label: 'Unstage all',
          run: () => void act(() => scm.unstage(project, 'all')),
        })}
        {section('changes', 'Changes', groups.changes, {
          label: 'Stage all',
          run: () => void act(() => scm.stage(project, 'all')),
        })}
        <section className="scm-group scm-history" aria-label="History">
          <h3>
            <History size={13} />
            <span>{historyFile ? `History of ${historyFile}` : 'History'}</span>
            {historyFile && (
              <button
                className="link"
                onClick={() => {
                  setHistoryFile(undefined);
                  setSelected(null);
                }}
              >
                All files
              </button>
            )}
          </h3>
          {hiddenCommits > 0 && <p>{hiddenCommitsLine(hiddenCommits)}</p>}
          <ol>
            {log.map(gitCommit => (
              <li key={gitCommit.commit}>
                <button
                  className="scm-commit-row"
                  onClick={() => {
                    if (historyFile) {
                      setSelected(null);
                      const i = log.findIndex(x => x.commit === gitCommit.commit);
                      setRange({
                        from: log[i + 1]?.commit ?? gitCommit.commit,
                        to: gitCommit.commit,
                      });
                    }
                  }}
                  disabled={!historyFile}
                  title={historyFile ? 'Compare with the version before it' : 'Select a file to compare its versions'}
                >
                  <span>{gitCommit.message}</span>
                  <small>
                    {gitCommit.commit.slice(0, 7)} · {gitCommit.author} · {new Date(gitCommit.date).toLocaleString()}
                  </small>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>
      {syncOpen && (
        <SyncDialog
          project={project}
          status={status}
          copy={copy}
          busy={busy}
          onClose={() => setSyncOpen(false)}
          onPullDefault={() => fromSync(pullDefault)}
          onPublish={() => fromSync(publishCopy)}
          onPushDefault={() => fromSync(pushDefault)}
        />
      )}
      <div className="scm-main">{mainPane}</div>
    </section>
  );
}
/** Counts commits to push and pull, or says the branch was never published. */
function SyncCounters({ status }: { status: GitStatus }) {
  if (!isPublished(status.upstream)) {
    return (
      <span className="scm-sync" aria-label="Not published" title="This branch has no upstream branch yet. Publish branch creates it.">
        Not published
      </span>
    );
  }
  return (
    <span className="scm-sync" aria-label={`${status.ahead} commits to push, ${status.behind} to pull`} title={`Tracking ${status.upstream}`}>
      <ArrowUp size={12} />
      {status.ahead} to push
      <ArrowDown size={12} />
      {status.behind} to pull
    </span>
  );
}
function versionName(rev: string, log: Commit[] = []) {
  if (rev === 'worktree') return 'Working tree';
  if (rev === 'index') return 'Last commit and staged changes';
  if (rev === 'HEAD') return 'Last commit';
  const gitCommit = log.find(x => x.commit === rev);
  return gitCommit ? `${rev.slice(0, 7)} ${gitCommit.message}` : rev.slice(0, 7);
}
function IgnoreChooser({ path, onAdd, onCancel }: { path: string; onAdd: (pattern: string) => void; onCancel: () => void }) {
  const choices = ignoreChoices(path);
  const [pattern, setPattern] = useState(choices[0].pattern);
  return (
    <div className="scm-ignore" role="group" aria-label={`Add ${path} to .gitignore`}>
      {choices.map(choice => (
        <label key={choice.pattern}>
          <input type="radio" name={'ignore-' + path} checked={pattern === choice.pattern} onChange={() => setPattern(choice.pattern)} />
          <span>{choice.label}</span>
          <code>{choice.pattern}</code>
        </label>
      ))}
      <div>
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={() => onAdd(pattern)}>
          Add to .gitignore
        </button>
      </div>
    </div>
  );
}
