/** The header's actions: Commit and a More actions menu, with an optional status before them. */
import { useId, type ReactNode } from 'react';
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
  /** Files of the open project that differ from the last commit; shown on the button when above zero. */
  uncommittedFiles: number;
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

/**
 * Commit stays focusable while it is off, so keyboard users reach the reason too. It is marked
 * aria-disabled instead of disabled, and a tooltip says why on hover and focus.
 */
function CommitButton({ state }: { state: HeaderActionState }) {
  const tooltipId = useId();
  const unavailable = state.commitDisabled;
  const handleClick = unavailable ? undefined : state.onCommitClick;
  const showCount = !unavailable && state.uncommittedFiles > 0;
  // An unavailable Commit is an outlined, faded button rather than a primary one, so it does not
  // compete with the actions that can run.
  const className = unavailable ? 'commit-button' : 'primary commit-button';
  return (
    <span className="commit-wrap">
      <button
        className={className}
        aria-label="Commit"
        aria-disabled={unavailable || undefined}
        aria-describedby={unavailable ? tooltipId : undefined}
        onClick={handleClick}
        title={unavailable ? undefined : `${state.commitTitle} (${changedFilesLabel(state.uncommittedFiles)})`}
      >
        <GitCommitIcon size={16} />
        <span className="action-label">Commit</span>
        {showCount && (
          <span className="commit-count" aria-hidden="true">
            {state.uncommittedFiles}
          </span>
        )}
      </button>
      {unavailable && (
        <span role="tooltip" id={tooltipId} className="commit-tooltip">
          {state.commitTitle}
        </span>
      )}
    </span>
  );
}

function changedFilesLabel(count: number) {
  return count === 1 ? '1 changed file' : `${count} changed files`;
}

/** Renders Commit and the More actions menu; New and Export live in the menu. */
export function HeaderActions({ leadingStatus, ...state }: Props) {
  return (
    <div className="header-actions">
      {leadingStatus}
      {state.hasFile && <CommitButton state={state} />}
      <MenuButton ariaLabel="More actions" title="More actions" icon={<MoreHorizontal size={18} strokeWidth={4} />} buttonClassName="more-actions" items={moreActionItems(state)} />
    </div>
  );
}
