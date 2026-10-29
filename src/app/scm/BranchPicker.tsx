/** Displays the current branch and offers branch creation and switching. */
import React, { useEffect, useRef, useState } from 'react';
import { GitBranch, Plus } from 'lucide-react';
import { scm, type BranchInUse } from '../projects/api';

const holderOf = (inUse: BranchInUse[], branch: string) => inUse.find(item => item.branch === branch)?.inUseBy;

/** One branch of the list; a branch held by another working copy names who holds it. */
function BranchOption({ branch, holder }: { branch: string; holder?: string }) {
  return (
    <option value={branch} disabled={holder !== undefined}>
      {holder === undefined ? branch : `${branch} (in use by ${holder})`}
    </option>
  );
}

/** Displays and switches branches or creates a new branch. */
export function BranchPicker({
  project,
  current,
  version,
  disabled,
  inUse = [],
  onSwitch,
}: {
  project: string;
  current: string;
  version: number;
  disabled: boolean;
  /** Branches other working copies hold in server mode; they cannot be switched to. */
  inUse?: BranchInUse[];
  onSwitch: (branch: string, create: boolean) => void;
}) {
  const [branches, setBranches] = useState<{ local: string[]; remote: string[] }>({
    local: [],
    remote: [],
  });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const newBranchButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  // The form's controls vanish when it closes, so focus goes back to the button that opened it.
  useEffect(() => {
    if (creating || !returnFocus.current) return;
    returnFocus.current = false;
    newBranchButton.current?.focus();
  }, [creating]);
  function cancelCreating() {
    returnFocus.current = true;
    setCreating(false);
  }
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
  const holder = holderOf(inUse, current);
  const currentLabel = holder ? `${current} (in use by ${holder})` : current;
  const remoteOnly = branches.remote.filter(r => !branches.local.includes(r.slice(r.indexOf('/') + 1)));
  return (
    <div className="branch-picker">
      <label>
        <GitBranch size={14} />
        <span>Branch</span>
        <select
          aria-label="Branch"
          title={currentLabel}
          value={current}
          disabled={disabled}
          onChange={e => {
            if (e.target.value !== current) onSwitch(e.target.value, false);
          }}
        >
          <optgroup label="Local">
            {branches.local.map(branch => (
              <BranchOption key={branch} branch={branch} holder={branch === current ? undefined : holderOf(inUse, branch)} />
            ))}
            {!branches.local.includes(current) && <option value={current}>{current || '(no branch)'}</option>}
          </optgroup>
          {remoteOnly.length > 0 && (
            <optgroup label="Remote">
              {remoteOnly.map(branch => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {creating ? (
        <form
          className="branch-create"
          onSubmit={submitEvent => {
            submitEvent.preventDefault();
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
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                cancelCreating();
              }
            }}
          />
          <button type="submit" className="primary" disabled={!name.trim()}>
            Create
          </button>
          <button type="button" onClick={cancelCreating}>
            Cancel
          </button>
        </form>
      ) : (
        <button ref={newBranchButton} type="button" onClick={() => setCreating(true)} disabled={disabled}>
          <Plus size={13} />
          New branch
        </button>
      )}
      {holder && <span className="branch-holder">In use by {holder}</span>}
    </div>
  );
}
