/** Reviews selected file changes before committing, pushing or reverting them. */
import { useCapabilities } from '../auth/Capabilities';
import { useEvents } from '../projects/useEvents';
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, GitCommit, RotateCcw, Upload } from 'lucide-react';
import { Modal } from '../projects/Modal';
import { api, scm, type GitChange, type GitDiff, type GitStatus } from '../projects/api';
import { DiffView } from './DiffView';
import './scm.css';
// Selected files use git commit --only so unrelated changes remain untouched. During a merge, only
// the merge can be committed. Reverting requires confirmation and moves the replaced disk version
// to trash.
/** Reports a completed commit and its optional push result. */
export type CommitOutcome = {
  commit: string;
  altered: string[];
  pushed?: { ok: boolean; message: string };
  files: string[];
};
type Props = {
  project: string;
  projectName?: string;
  itemHints?: Record<string, string>;
  unsaved?: string[];
  onClose: () => void;
  onCommitted: (r: CommitOutcome) => void;
  onReverted: (path: string, hash: string | null) => void;
  onSetIdentity?: () => void;
};
/** Builds a concise commit message from changed paths and optional item hints. */
export function suggestedMessage(paths: string[], itemHints: Record<string, string> = {}) {
  if (!paths.length) return '';
  if (paths.length === 1) {
    const p = paths[0];
    const item = itemHints[p];
    return item ? `Update ${item} in ${p}` : `Update ${p}`;
  }
  return `Update ${paths.length} files`;
}
const describe = (c: GitChange) => (c.conflicted ? 'conflicted' : c.untracked ? 'new' : c.worktree === 'D' || c.index === 'D' ? 'deleted' : c.index === 'A' ? 'added' : 'modified');
/** Reviews selected changes before committing, pushing or confirmed reversion. */
export function CommitDialog({ project, projectName, itemHints = {}, unsaved = [], onClose, onCommitted, onReverted, onSetIdentity }: Props) {
  const access = useCapabilities(project);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [error, setError] = useState('');
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState('');
  const [diff, setDiff] = useState<GitDiff | null>(null);
  const [diskHash, setDiskHash] = useState<string | null | undefined>(undefined);
  const [message, setMessage] = useState('');
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    scm
      .status(project)
      .then(s => {
        if (!live) return;
        setStatus(s);
        // Files are named from the repository root: projects sharing it may hold the same path.
        const paths = s.changes.filter(c => !c.conflicted).map(c => c.repoPath);
        setTicked(new Set(paths));
        setSelected(current => (current && s.changes.some(c => c.repoPath === current) ? current : (s.changes[0]?.repoPath ?? '')));
      })
      .catch(e => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [project, tick]);
  // An identity set from the Set Git identity dialog enables Commit without losing the selection.
  useEvents(type => {
    if (type !== 'identity') return;
    scm
      .status(project)
      .then(next => setStatus(previous => (previous ? { ...previous, identityConfigured: next.identityConfigured } : next)))
      .catch(() => {});
  });
  const changes = status?.changes ?? [];
  const conflicts = changes.filter(c => c.conflicted);
  const merging = !!status?.merging;
  const tickedPaths = useMemo(() => changes.map(c => c.repoPath).filter(path => ticked.has(path)), [changes, ticked]);
  useEffect(() => {
    if (!edited) setMessage(merging ? '' : suggestedMessage(tickedPaths, itemHints));
  }, [tickedPaths.join('\0'), merging, edited]);
  const change = changes.find(c => c.repoPath === selected);
  useEffect(() => {
    setConfirmRevert(false);
    if (!change) {
      setDiff(null);
      return;
    }
    let live = true;
    scm
      .changeDiff(project, change.repoPath, 'HEAD', 'worktree')
      .then(d => {
        if (live) setDiff(d);
      })
      .catch(e => {
        if (live) setError(e.message);
      });
    // The version that a revert would move to the trash is the file on disk now.
    setDiskHash(undefined);
    if (change.worktree === 'D' || change.index === 'D') setDiskHash(null);
    else if (change.project && change.projectPath !== undefined)
      api
        .file(change.project, change.projectPath)
        .then(f => {
          if (live) setDiskHash(f.hash);
        })
        .catch(() => {
          if (live) setDiskHash(undefined);
        });
    return () => {
      live = false;
    };
  }, [project, change?.repoPath, status]);
  // In server mode commits are written for the signed-in person, so no Git identity is asked for.
  const identity = !access.local || status?.identityConfigured !== false;
  const canCommit = access.can('commit') && !!message.trim() && !busy && identity && (merging ? !conflicts.length : tickedPaths.length > 0);
  async function commit(push: boolean) {
    setBusy(true);
    setError('');
    try {
      const r = await scm.commit(project, message.trim(), merging ? {} : { repoPaths: tickedPaths, push });
      if (merging && push) {
        const p = await scm.remote(project, 'push');
        onCommitted({ ...r, pushed: { ok: p.ok, message: p.stderr }, files: tickedPaths });
      } else onCommitted({ ...r, files: tickedPaths });
    } catch (e) {
      setError((e as Error).message);
      setTick(t => t + 1);
    } finally {
      setBusy(false);
    }
  }
  async function revert() {
    if (!change?.project || change.projectPath === undefined || diskHash === undefined) return;
    setBusy(true);
    setError('');
    try {
      // A file of a sibling project is reverted through the project that holds it.
      const r = await scm.revert(change.project, change.projectPath, diskHash);
      if (change.project === project) onReverted(change.projectPath, r.hash);
      setTick(t => t + 1);
    } catch (e) {
      setError((e as Error).message);
      setTick(t => t + 1);
    } finally {
      setBusy(false);
      setConfirmRevert(false);
    }
  }
  const toggle = (p: string) =>
    setTicked(s => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  const footer = (
    <>
      {!merging &&
        change &&
        (confirmRevert ? (
          <span className="commit-confirm" role="group" aria-label="Confirm revert">
            <span>Revert {change.path}? The current version goes to the trash.</span>
            <button onClick={() => setConfirmRevert(false)} disabled={busy}>
              Keep it
            </button>
            <button className="danger" onClick={() => void revert()} disabled={busy || diskHash === undefined}>
              <RotateCcw size={13} />
              Revert
            </button>
          </span>
        ) : (
          <button className="commit-revert" onClick={() => setConfirmRevert(true)} disabled={busy || change.conflicted} aria-label={`Revert ${change.path} to last commit`}>
            <RotateCcw size={13} />
            Revert to last commit
          </button>
        ))}
      <span className="commit-spacer" />
      <button onClick={onClose}>Cancel</button>
      <button
        onClick={() => void commit(true)}
        disabled={!canCommit || !access.can('push')}
        title={
          access.control('commit').title ??
          (Object.keys(status?.remotes ?? {}).length ? 'Commit, then push to the remote' : 'This project has no remote yet; the commit is made and the push explains how to add one')
        }
      >
        <Upload size={13} />
        Commit &amp; push
      </button>
      <button className="primary" onClick={() => void commit(false)} disabled={!canCommit} title={access.control('commit').title}>
        <GitCommit size={13} />
        {merging ? 'Commit merge' : 'Commit'}
      </button>
    </>
  );
  return (
    <Modal title="Commit" size="wide" className="commit-dialog" onCancel={onClose} footer={footer}>
      {projectName && (
        <p className="commit-scope">
          {projectName}
          {status?.branch ? (
            <>
              {' '}
              · on <code>{status.branch}</code>
            </>
          ) : null}
        </p>
      )}
      {!status && !error && <p>Loading changes…</p>}
      {error && (
        <p role="alert" className="scm-error">
          {error}
        </p>
      )}
      {status && !identity && (
        <div role="alert" className="scm-note warning">
          <AlertTriangle size={14} />
          <span>Not committed: set your Git identity (user.name and user.email) for this repository.</span>
          {access.local && onSetIdentity && <button onClick={onSetIdentity}>Set Git identity…</button>}
        </div>
      )}
      {unsaved.length > 0 && (
        <div className="scm-note warning" role="note">
          <AlertTriangle size={14} />
          <span>Not saved to file yet, so not part of this commit: {unsaved.join(', ')}</span>
        </div>
      )}
      {merging && (
        <div className="scm-note warning" role="note">
          <AlertTriangle size={14} />
          <span>
            A merge is in progress: only the merge can be committed
            {conflicts.length ? '. Repair and stage these conflicted files first:' : '.'}
          </span>
          {conflicts.length > 0 && (
            <ul>
              {conflicts.map(c => (
                <li key={c.path}>
                  <code>{c.path}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {status && !changes.length && <p className="scm-empty">No changes. The files match the last commit.</p>}
      {changes.length > 0 && (
        <div className="commit-body">
          <ul className="commit-files" aria-label="Changed files">
            {changes.map(c => (
              <li key={c.repoPath} className={c.repoPath === selected ? 'selected' : ''}>
                <input type="checkbox" aria-label={c.path} checked={ticked.has(c.repoPath)} disabled={merging || c.conflicted} onChange={() => toggle(c.repoPath)} />
                <button className="commit-file" aria-pressed={c.repoPath === selected} onClick={() => setSelected(c.repoPath)} title={c.path}>
                  <span className="commit-path">{c.path}</span>
                  <small className={`commit-kind k-${describe(c)}`}>{describe(c)}</small>
                </button>
              </li>
            ))}
          </ul>
          <div className="commit-diff">
            {diff && change ? (
              <section role="region" aria-label={`Diff of ${change.path}`}>
                {diff.binary ? (
                  <p>Binary file; no text diff.</p>
                ) : (
                  <DiffView
                    label={`Changes to ${change.path}`}
                    filename={change.path}
                    before={diff.before}
                    after={diff.after}
                    beforeLabel={diff.beforeExists ? 'Last commit' : 'Not in the last commit'}
                    afterLabel={diff.afterExists ? 'File now' : 'Deleted'}
                  />
                )}
              </section>
            ) : (
              <p className="scm-empty">Select a file to see its changes.</p>
            )}
          </div>
        </div>
      )}
      <label className="commit-message">
        <span>Message</span>
        <textarea
          aria-label="Commit message"
          rows={2}
          value={message}
          onChange={e => {
            setMessage(e.target.value);
            setEdited(true);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canCommit) {
              e.preventDefault();
              void commit(false);
            }
          }}
        />
      </label>
    </Modal>
  );
}
