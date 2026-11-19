import { useState } from 'react';
import { GitBranch } from 'lucide-react';
import { Modal } from '../projects/Modal';
import { scm } from '../projects/api';
import { BranchPicker } from '../scm/BranchPicker';
import { useItemDiffContext } from './ItemDiffContext';

/** Proposes a readable Git branch name for an inspected item. */
export function suggestedItemBranch(name: string) {
  const stem = name
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `item/${stem || 'definition'}`;
}

/** Creates or switches the inspected item's branch through the ordinary SCM operation. */
export function switchItemBranch(project: string, branch: string, create: boolean) {
  return scm.switch(project, branch, create);
}

/** Shows the current branch and opens the shared branch picker for editors. */
export function BranchControl({ name, dirty }: { name: string; dirty?: boolean }) {
  const overlay = useItemDiffContext();
  const [open, setOpen] = useState(false);
  if (!overlay) return null;
  const { project, branch } = overlay;
  const canEdit = !project.actions || (project.actions.includes('edit') && project.actions.includes('branch'));
  const disabled = dirty || !branch;
  async function switchTo(next: string, create: boolean) {
    await switchItemBranch(project.slug, next, create);
    setOpen(false);
    overlay?.refreshBranch();
  }
  return (
    <div className="item-branch-control">
      {branch && <span>Current branch: {branch}</span>}
      {canEdit && (
        <button type="button" disabled={disabled} title={dirty ? 'Save or discard Source changes before switching branches.' : undefined} onClick={() => setOpen(true)}>
          <GitBranch size={14} aria-hidden="true" />
          Start a branch for this item
        </button>
      )}
      {open && (
        <Modal
          title="Start a branch for this item"
          onCancel={() => setOpen(false)}
          footer={
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          }
        >
          <BranchPicker project={project.slug} current={branch} version={0} disabled={false} inUse={project.copy?.inUseBranches} initialCreateName={suggestedItemBranch(name)} onSwitch={switchTo} />
        </Modal>
      )}
    </div>
  );
}
