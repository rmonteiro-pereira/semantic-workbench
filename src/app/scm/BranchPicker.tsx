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
  initialCreateName,
  onSwitch,
}: {
  project: string;
  current: string;
  version: number;
  disabled: boolean;
  /** Branches other working copies hold in server mode; they cannot be switched to. */
  inUse?: BranchInUse[];
  /** Opens the existing create form with a name suggested by the inspected item. */
  initialCreateName?: string;
  onSwitch: (branch: string, create: boolean) => void | Promise<void>;
}) {
  const [branches, setBranches] = useState<{ local: string[]; remote: string[] }>({
    local: [],
    remote: [],
  });
  const [creating, setCreating] = useState(initialCreateName !== undefined);
  const [name, setName] = useState(initialCreateName ?? '');
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');
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
    setError('');
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
  async function switchTo(branch: string, create: boolean) {
    setError('');
    setSwitching(true);
    try {
      await onSwitch(branch, create);
      if (create) {
        setCreating(false);
        setName('');
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not switch branches.');
    } finally {
      setSwitching(false);
    }
  }

  function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() && !switching) void switchTo(name.trim(), true);
  }

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
          disabled={disabled || switching}
          onChange={e => {
            if (e.target.value !== current) void switchTo(e.target.value, false);
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
        <form className="branch-create" onSubmit={submitCreate}>
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
          <button type="submit" className="primary" disabled={disabled || switching || !name.trim()}>
            Create
          </button>
          <button type="button" onClick={cancelCreating}>
            Cancel
          </button>
        </form>
      ) : (
        <button ref={newBranchButton} type="button" onClick={() => setCreating(true)} disabled={disabled || switching}>
          <Plus size={13} />
          New branch
        </button>
      )}
      {error && (
        <p role="alert" className="dialog-error">
          {error}
        </p>
      )}
      {holder && <span className="branch-holder">In use by {holder}</span>}
    </div>
  );
}
