/** The header's actions: Commit and a More actions menu, with an optional status before them. */
import type { ReactNode } from 'react';
import { Download, GitCommit as GitCommitIcon, MoreHorizontal, Plus } from 'lucide-react';
import type { MenuItem } from '../projects/Menu';
import { MenuButton } from '../projects/Menu';

/** The header's decisions, made once by WorkspaceHeader for its wide and phone layouts. */
export type HeaderActionState = {
  newItems: MenuItem[];
  newTitle: string;
  newDisabled: string | false;
  download: () => void;
  exportTitle: string;
  exportDisabled: boolean;
  /** Commit is left out while no file is open. */
  hasFile: boolean;
  onCommitClick: () => void;
  commitDisabled: boolean;
  commitTitle: string;
};

/** Lists the actions behind More actions, for the wide and the phone header alike. */
function moreActionItems(state: HeaderActionState): MenuItem[] {
  return [
    {
      label: 'New',
      icon: <Plus size={15} />,
      hint: state.newTitle,
      disabled: state.newDisabled,
      submenu: state.newItems,
      run: () => {},
    },
    {
      label: 'Export',
      icon: <Download size={15} />,
      hint: state.exportTitle,
      disabled: state.exportDisabled ? state.exportTitle : false,
      run: state.download,
    },
  ];
}

type Props = HeaderActionState & {
  /** Drawn before Commit when the title has no meta line to hold it. */
  leadingStatus?: ReactNode;
};

/** Renders Commit and the More actions menu; New and Export live in the menu. */
export function HeaderActions({ leadingStatus, ...state }: Props) {
  return (
    <div className="header-actions">
      {leadingStatus}
      {state.hasFile && (
        <button className="primary commit-button" aria-label="Commit…" onClick={state.onCommitClick} disabled={state.commitDisabled} title={state.commitTitle}>
          <GitCommitIcon size={16} />
          <span className="action-label">Commit…</span>
        </button>
      )}
      <MenuButton ariaLabel="More actions" title="More actions" icon={<MoreHorizontal size={18} strokeWidth={4} />} buttonClassName="more-actions" items={moreActionItems(state)} />
    </div>
  );
}
