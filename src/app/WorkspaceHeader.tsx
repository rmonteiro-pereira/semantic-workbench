/** Presentation and event handling for workspace header. */
import { useCapabilities } from '../auth/Capabilities';
import {
  Download,
  GitCommit as GitCommitIcon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  X,
} from 'lucide-react';
import React from 'react';
import type { Doc, WorkspaceStatus } from '../projects/api';
import type { AutosaveStatus } from '../projects/autosave';
import type { MenuItem } from '../projects/Menu';
import { MenuButton } from '../projects/Menu';
import type { ValidatedModel } from './types';

type Props = {
  personMenu?: React.ReactNode;
  workspaceToggle: React.RefObject<HTMLButtonElement | null>;
  compact: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSidebarHidden: React.Dispatch<React.SetStateAction<boolean>>;
  model: ValidatedModel;
  current: Doc | null;
  newItems: () => MenuItem[];
  download: () => void;
  hasSource: boolean;
  saveStatus: AutosaveStatus;
  flush: () => Promise<void>;
  saveState: string;
  error: string;
  setShowValidation: React.Dispatch<React.SetStateAction<boolean>>;
  openStale: () => Promise<void>;
  setCommitting: React.Dispatch<React.SetStateAction<boolean>>;
  status: WorkspaceStatus | null;
};
/** Renders workspace header. */
export const WorkspaceHeader = React.memo(function WorkspaceHeader({
  personMenu,
  workspaceToggle,
  compact,
  sidebarOpen,
  setSidebarOpen,
  setSidebarHidden,
  model,
  current,
  newItems,
  download,
  hasSource,
  saveStatus,
  flush,
  saveState,
  error,
  setShowValidation,
  openStale,
  setCommitting,
  status,
}: Props) {
  const access = useCapabilities(current?.project);
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
    if (saveStatus === 'invalid') {
      return 'show the validation findings';
    }
    if (saveStatus === 'stale') {
      return 'compare with the file on disk';
    }
    return 'open Commit';
  }

  function handleSaveStateClick() {
    if (saveStatus === 'invalid' || !!error) setShowValidation(true);
    else if (saveStatus === 'stale') void openStale();
    else setCommitting(true);
  }

  function handleCommitClick() {
    void flush();
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
            items={access.can('edit') ? newItems() : []}
          />
          <button
            aria-label="Export"
            title={hasSource ? 'Download the file exactly as it is' : 'Open a file to export it.'}
            disabled={!hasSource}
            onClick={download}
          >
            <Download size={15} />
            <span className="action-label">Export</span>
          </button>
          <button
            className={`save-state s-${saveStatus}`}
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
            disabled={!current || status?.gitAvailable === false || !access.can('commit')}
            title={
              access.control('commit').title ??
              (status?.gitAvailable === false
                ? 'Git is not available on this machine'
                : 'Commit changed files of this project')
            }
          >
            <GitCommitIcon size={15} />
            <span className="action-label">Commit…</span>
          </button>
        </div>
        {personMenu}
      </header>
    </>
  );
});
