/** The header actions on a phone: save state dot, Commit icon and a More actions menu. */
import { Download, GitCommit as GitCommitIcon, MoreHorizontal, Plus, Shield } from 'lucide-react';
import type { MenuItem } from '../projects/Menu';
import { MenuButton } from '../projects/Menu';
import { saveNeedsAction, type AutosaveStatus } from '../projects/autosave';
import { useAdminEntry } from './admin/AdminLauncher';

/** The header's decisions, made once by WorkspaceHeader for both of its layouts. */
export type HeaderActionState = {
  newItems: MenuItem[];
  newTitle: string;
  newDisabled: string | false;
  download: () => void;
  exportTitle: string;
  exportDisabled: boolean;
  hasFile: boolean;
  saveStatus: AutosaveStatus;
  saveStateLabel: string;
  saveStateTitle: string;
  onSaveStateClick: () => void;
  onCommitClick: () => void;
  commitDisabled: boolean;
  commitTitle: string;
};

/** Lists what the wide header shows as buttons: New and Export, then Admin when allowed. */
function useMoreActionItems(state: HeaderActionState): MenuItem[] {
  const openAdmin = useAdminEntry();
  const items: MenuItem[] = [
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
  if (openAdmin) {
    items.push({
      label: 'Admin',
      icon: <Shield size={15} />,
      separatorBefore: true,
      run: openAdmin,
    });
  }
  return items;
}

/** Renders the phone's actions; everything else lives in the More actions menu. */
export function PhoneHeaderActions(state: HeaderActionState) {
  const items = useMoreActionItems(state);
  const needsAttention = state.hasFile && saveNeedsAction(state.saveStatus);
  const attentionClass = needsAttention ? ' save-dot-alert' : '';
  return (
    <div className="header-phone-actions">
      <button
        className={`save-dot save-state s-${state.saveStatus}${attentionClass}`}
        role="status"
        aria-label="Save state"
        disabled={!state.hasFile}
        title={state.saveStateTitle}
        onClick={state.onSaveStateClick}
      >
        <span className="save-state-text">{state.saveStateLabel}</span>
      </button>
      <button
        className="primary commit-icon"
        aria-label="Commit…"
        onClick={state.onCommitClick}
        disabled={state.commitDisabled}
        title={state.commitTitle}
      >
        <GitCommitIcon size={16} />
      </button>
      <MenuButton
        ariaLabel="More actions"
        title="More actions"
        icon={<MoreHorizontal size={18} />}
        buttonClassName="more-actions"
        items={items}
      />
    </div>
  );
}
