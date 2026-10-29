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
  commitDisabled: boolean;
  commitTitle: string;
  /** Files with changes not yet committed; the badge on Commit shows it when above zero. */
  uncommittedCount: number;
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

/** Adds the number of changed files to the tooltip, because the badge itself is hidden from screen readers. */
function commitTitleWithCount(state: HeaderActionState): string {
  if (state.uncommittedCount === 0) return state.commitTitle;
  return `${state.commitTitle} (${state.uncommittedCount} changed)`;
}

/**
 * Commit stays focusable while it is off, so keyboard users reach the reason too. It is marked
 * aria-disabled instead of disabled, and a tooltip says why on hover and focus.
 */
function CommitButton({ state }: { state: HeaderActionState }) {
  const tooltipId = useId();
  const unavailable = state.commitDisabled;
  const handleClick = unavailable ? undefined : state.onCommitClick;
  // A button that cannot run is the plain button, dimmed, and shows no count.
  const className = unavailable ? 'commit-button' : 'primary commit-button';
  const showCount = !unavailable && state.uncommittedCount > 0;
  return (
    <span className="commit-wrap">
      <button
        className={className}
        aria-label="Commit"
        aria-disabled={unavailable || undefined}
        aria-describedby={unavailable ? tooltipId : undefined}
        onClick={handleClick}
        title={unavailable ? undefined : commitTitleWithCount(state)}
      >
        <GitCommitIcon size={16} />
        <span className="action-label">Commit</span>
        {showCount && (
          <span className="commit-count" aria-hidden="true">
            {state.uncommittedCount}
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

/** Renders Commit and the More actions menu; New and Export live in the menu. */
export function HeaderActions({ leadingStatus, ...state }: Props) {
  return (
    <div className="header-actions">
      {leadingStatus}
      {state.hasFile && <CommitButton state={state} />}
      <MenuButton ariaLabel="More actions" title="More actions" icon={<MoreHorizontal size={18} strokeWidth={2} />} buttonClassName="more-actions" items={moreActionItems(state)} />
    </div>
  );
}
