import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, GitCommit, RotateCcw, Upload } from 'lucide-react';
import { Modal } from '../projects/Modal';
import { api, scm, type GitChange, type GitDiff, type GitStatus } from '../projects/api';
import { DiffView } from './DiffView';
import './scm.css';
// Commit… (FR-044–FR-046, ui-contracts "Commit"): the repository's changed files, all ticked, the
// diff of the selected file, a pre-filled message, Commit / Commit & push, and Revert to last commit
// with a confirmation (the replaced version goes to the trash). During a merge only the merge can
// be committed. Ticked files are committed with `git commit --only`, so other work stays as it is.
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
export function suggestedMessage(paths: string[], itemHints: Record<string, string> = {}) {
  if (!paths.length) return '';
  if (paths.length === 1) {
    const p = paths[0];
    const item = itemHints[p];
    return item ? `Update ${item} in ${p}` : `Update ${p}`;
  }
  return `Update ${paths.length} files`;
}
const describe = (c: GitChange) =>
  c.conflicted
    ? 'conflicted'
    : c.untracked
      ? 'new'
      : c.worktree === 'D' || c.index === 'D'
        ? 'deleted'
        : c.index === 'A'
          ? 'added'
          : 'modified';
export function CommitDialog({
  project,
  projectName,
  itemHints = {},
  unsaved = [],
  onClose,
  onCommitted,
  onReverted,
  onSetIdentity,
}: Props) {
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
        const paths = s.changes.filter(c => !c.conflicted).map(c => c.path);
        setTicked(new Set(paths));
        setSelected(x => (x && s.changes.some(c => c.path === x) ? x : (s.changes[0]?.path ?? '')));
      })
      .catch(e => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [project, tick]);
  const changes = status?.changes ?? [];
  const conflicts = changes.filter(c => c.conflicted);
  const merging = !!status?.merging;
  const tickedPaths = useMemo(
    () => changes.map(c => c.path).filter(p => ticked.has(p)),
    [changes, ticked],
  );
  useEffect(() => {
    if (!edited) setMessage(merging ? '' : suggestedMessage(tickedPaths, itemHints));
  }, [tickedPaths.join('\0'), merging, edited]);
  const change = changes.find(c => c.path === selected);
  useEffect(() => {
    setConfirmRevert(false);
    if (!change) {
      setDiff(null);
      return;
    }
    let live = true;
    scm
      .diff(project, change.path, 'HEAD', 'worktree')
      .then(d => {
        if (live) setDiff(d);
      })
      .catch(e => {
        if (live) setError(e.message);
      });
    // The version that a revert would move to the trash is the file on disk now.
    setDiskHash(undefined);
    if (change.worktree === 'D' || change.index === 'D') setDiskHash(null);
    else
      api
        .file(project, change.path)
        .then(f => {
          if (live) setDiskHash(f.hash);
        })
        .catch(() => {
          if (live) setDiskHash(undefined);
        });
    return () => {
      live = false;
    };
  }, [project, change?.path, status]);
  const identity = status?.identityConfigured !== false;
  const canCommit =
    !!message.trim() && !busy && identity && (merging ? !conflicts.length : tickedPaths.length > 0);
  async function commit(push: boolean) {
    setBusy(true);
    setError('');
    try {
      const r = await scm.commit(
        project,
        message.trim(),
        merging ? {} : { paths: tickedPaths, push },
      );
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
    if (!change || diskHash === undefined) return;
    setBusy(true);
    setError('');
    try {
      const r = await scm.revert(project, change.path, diskHash);
      onReverted(change.path, r.hash);
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
            <button
              className="danger"
              onClick={() => void revert()}
              disabled={busy || diskHash === undefined}
            >
              <RotateCcw size={13} />
              Revert
            </button>
          </span>
        ) : (
          <button
            className="commit-revert"
            onClick={() => setConfirmRevert(true)}
            disabled={busy || change.conflicted}
            aria-label={`Revert ${change.path} to last commit`}
          >
            <RotateCcw size={13} />
            Revert to last commit
          </button>
        ))}
      <span className="commit-spacer" />
      <button onClick={onClose}>Cancel</button>
      <button
        onClick={() => void commit(true)}
        disabled={!canCommit}
        title={
          Object.keys(status?.remotes ?? {}).length
            ? 'Commit, then push to the remote'
            : 'This project has no remote yet; the commit is made and the push explains how to add one'
        }
      >
        <Upload size={13} />
        Commit &amp; push
      </button>
      <button className="primary" onClick={() => void commit(false)} disabled={!canCommit}>
        <GitCommit size={13} />
        {merging ? 'Commit merge' : 'Commit'}
      </button>
    </>
  );
  return (
    <Modal title="Commit" size="large" className="commit-dialog" onCancel={onClose} footer={footer}>
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
          <span>
            Not committed: set your Git identity (user.name and user.email) for this repository.
          </span>
          {onSetIdentity && <button onClick={onSetIdentity}>Set Git identity…</button>}
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
      {status && !changes.length && (
        <p className="scm-empty">No changes. The files match the last commit.</p>
      )}
      {changes.length > 0 && (
        <div className="commit-body">
          <ul className="commit-files" aria-label="Changed files">
            {changes.map(c => (
              <li key={c.path} className={c.path === selected ? 'selected' : ''}>
                <input
                  type="checkbox"
                  aria-label={c.path}
                  checked={ticked.has(c.path)}
                  disabled={merging || c.conflicted}
                  onChange={() => toggle(c.path)}
                />
                <button
                  className="commit-file"
                  aria-pressed={c.path === selected}
                  onClick={() => setSelected(c.path)}
                  title={c.path}
                >
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
