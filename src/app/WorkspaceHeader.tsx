/** Presentation and event handling for workspace header. */
import {
  Download,
  GitCommit as GitCommitIcon,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  X,
} from 'lucide-react';
import React from 'react';
import type { Doc, WorkspaceStatus } from '../projects/api';
import type { AutosaveState } from '../projects/autosave';
import type { MenuItem } from '../projects/Menu';
import { MenuButton } from '../projects/Menu';
import type { ValidatedModel } from './types';

type Props = {
  workspaceToggle: React.RefObject<HTMLButtonElement | null>;
  compact: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSidebarHidden: React.Dispatch<React.SetStateAction<boolean>>;
  model: ValidatedModel;
  current: Doc | null;
  newItems: () => MenuItem[];
  download: () => void;
  source: string;
  autosave: {
    state: AutosaveState;
    flush(): Promise<void>;
    resolved: (hash: string | null, text: string) => void;
    cancel: () => void;
  };
  saveState: string;
  result: { model: ValidatedModel; error: string };
  setShowValidation: React.Dispatch<React.SetStateAction<boolean>>;
  openStale: () => Promise<void>;
  setCommitting: React.Dispatch<React.SetStateAction<boolean>>;
  status: WorkspaceStatus | null;
};
/** Renders workspace header. */
export function WorkspaceHeader({
  workspaceToggle,
  compact,
  sidebarOpen,
  setSidebarOpen,
  setSidebarHidden,
  model,
  current,
  newItems,
  download,
  source,
  autosave,
  saveState,
  result,
  setShowValidation,
  openStale,
  setCommitting,
  status,
}: Props) {
  function getWorkspaceToggleLabel() {
    if (compact) {
      if (sidebarOpen) {
        return 'Close workspace';
      }
      return 'Open workspace';
    }
    if (sidebarOpen) {
      return 'Hide sidebar';
    }
    return 'Show sidebar';
  }

  function renderWorkspaceToggleIcon() {
    if (compact) {
      if (sidebarOpen) {
        return <X size={18} />;
      }
      return <Menu size={18} />;
    }
    if (sidebarOpen) {
      return <PanelLeftClose size={18} />;
    }
    return <PanelLeftOpen size={18} />;
  }

  function getSaveStateAction() {
    if (autosave.state.status === 'invalid') {
      return 'show the validation findings';
    }
    if (autosave.state.status === 'stale') {
      return 'compare with the file on disk';
    }
    return 'open Commit';
  }

  function handleSaveStateClick() {
    const saveStatus = autosave.state.status;
    if (saveStatus === 'invalid' || !!result.error) setShowValidation(true);
    else if (saveStatus === 'stale') void openStale();
    else setCommitting(true);
  }

  function handleCommitClick() {
    void autosave.flush();
    setCommitting(true);
  }

  return (
    <>
      <header className="workspace-header">
        <button
          ref={workspaceToggle}
          className="workspace-toggle"
          aria-label={getWorkspaceToggleLabel()}
          aria-expanded={sidebarOpen}
          aria-controls="workspace-sidebar"
          onClick={() => (compact ? setSidebarOpen(v => !v) : setSidebarHidden(v => !v))}
        >
          {renderWorkspaceToggleIcon()}
        </button>
        <div className="workspace-title">
          <h1 title={model?.name ?? current?.filename ?? 'Semantic Workbench'}>
            {model?.name ?? current?.filename ?? 'Semantic Workbench'}
          </h1>
          <span className="badge">
            <span className="dot" />
            {model?.kind ?? 'ODCS + Apache Ossie'}
          </span>
        </div>
        <div className="header-actions">
          <MenuButton
            ariaLabel="New"
            label={<span className="action-label">New</span>}
            icon={<Plus size={15} />}
            buttonClassName="new-menu"
            items={newItems()}
          />
          <MenuButton
            ariaLabel="More actions"
            title="More actions"
            icon={<MoreHorizontal size={16} />}
            items={[
              {
                label: 'Export',
                icon: <Download size={14} />,
                run: download,
                disabled: source ? false : 'Open a file to export it.',
                hint: 'Download the file exactly as it is',
              },
            ]}
          />
          <button
            className={`save-state s-${autosave.state.status}`}
            role="status"
            aria-label="Save state"
            disabled={!current}
            title={`${current ? saveState : 'No file open'} — ${getSaveStateAction()}`}
            onClick={handleSaveStateClick}
          >
            <span className="save-state-text">{current ? saveState : 'No file open'}</span>
          </button>
          <button
            className="primary"
            onClick={handleCommitClick}
            disabled={!current || status?.gitAvailable === false}
            title={
              status?.gitAvailable === false
                ? 'Git is not available on this machine'
                : 'Commit changed files of this project'
            }
          >
            <GitCommitIcon size={15} />
            <span className="action-label">Commit…</span>
          </button>
        </div>
      </header>
    </>
  );
}
