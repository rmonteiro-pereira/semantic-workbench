import React, { useEffect, useState } from 'react';
import { GitBranch, Plus } from 'lucide-react';
import { scm } from '../projects/api';
// Current branch, switch to a local or remote branch, or create one from here (FR-060).
export function BranchPicker({
  project,
  current,
  version,
  disabled,
  onSwitch,
}: {
  project: string;
  current: string;
  version: number;
  disabled: boolean;
  onSwitch: (branch: string, create: boolean) => void;
}) {
  const [branches, setBranches] = useState<{ local: string[]; remote: string[] }>({
    local: [],
    remote: [],
  });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  useEffect(() => {
    let live = true;
    scm
      .branches(project)
      .then(b => {
        if (live) setBranches(b);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [project, version]);
  const remoteOnly = branches.remote.filter(
    r => !branches.local.includes(r.slice(r.indexOf('/') + 1)),
  );
  return (
    <div className="branch-picker">
      <label>
        <GitBranch size={14} />
        <span>Branch</span>
        <select
          aria-label="Branch"
          value={current}
          disabled={disabled}
          onChange={e => {
            if (e.target.value !== current) onSwitch(e.target.value, false);
          }}
        >
          <optgroup label="Local">
            {branches.local.map(b => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
            {!branches.local.includes(current) && (
              <option value={current}>{current || '(no branch)'}</option>
            )}
          </optgroup>
          {remoteOnly.length > 0 && (
            <optgroup label="Remote">
              {remoteOnly.map(b => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {creating ? (
        <form
          className="branch-create"
          onSubmit={e => {
            e.preventDefault();
            if (name.trim()) {
              onSwitch(name.trim(), true);
              setCreating(false);
              setName('');
            }
          }}
        >
          <input
            aria-label="New branch name"
            autoFocus
            value={name}
            placeholder="feature/new-metric"
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setCreating(false);
              }
            }}
          />
          <button type="submit" className="primary" disabled={!name.trim()}>
            Create
          </button>
          <button type="button" onClick={() => setCreating(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setCreating(true)} disabled={disabled}>
          <Plus size={13} />
          New branch
        </button>
      )}
    </div>
  );
}
