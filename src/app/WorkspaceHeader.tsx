/** Presentation and event handling for workspace header. */
import './WorkspaceHeader.css';
import { useCapabilities } from '../auth/Capabilities';
import { useBrand } from '../brand/BrandContext';
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
import { PhoneHeaderActions } from './PhoneHeaderActions';
import type { ValidatedModel } from './types';
import { usePhoneScreen } from './useNarrowScreen';

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
  /** The save state in few words, drawn instead of `saveState` when the header is narrow. */
  saveStateShort: string;
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
  saveStateShort,
  error,
  setShowValidation,
  openStale,
  setCommitting,
  status,
}: Props) {
  const access = useCapabilities(current?.project);
  const { productName } = useBrand();
  const isPhone = usePhoneScreen();
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

  function getCommitTitle() {
    if (status?.gitAvailable === false) return 'Git is not available on this machine';
    return 'Commit changed files of this project';
  }

  // With no document open, the header names the product.
  const title = model?.name ?? current?.filename ?? productName;
  const canCreate = access.can('edit');
  const exportTitle = hasSource
    ? 'Download the file exactly as it is'
    : 'Open a file to export it.';
  const saveStateLabel = current ? saveState : 'No file open';
  const saveStateTitle = `${saveStateLabel} — ${getSaveStateAction()}`;
  const commitDisabled = !current || status?.gitAvailable === false || !access.can('commit');
  const commitTitle = access.control('commit').title ?? getCommitTitle();

  return (
    <>
      <header className={`workspace-header${isPhone ? ' header-phone' : ''}`}>
        <button
          ref={workspaceToggle}
          className="workspace-toggle"
          aria-label={getWorkspaceToggleLabel()}
          title={getWorkspaceToggleLabel()}
          aria-expanded={sidebarOpen}
          aria-controls="workspace-sidebar"
          onClick={() => (compact ? setSidebarOpen(v => !v) : setSidebarHidden(v => !v))}
        >
          {renderWorkspaceToggleIcon()}
        </button>
        <div className="workspace-title">
          <h1 title={title}>{title}</h1>
          <span className="badge">
            <span className="dot" />
            {model?.kind ?? 'ODCS + Apache Ossie'}
          </span>
        </div>
        {isPhone ? (
          <PhoneHeaderActions
            newItems={canCreate ? newItems() : []}
            newTitle="Create a new file or item"
            newDisabled={canCreate ? false : 'Your role cannot create items here.'}
            download={download}
            exportTitle={exportTitle}
            exportDisabled={!hasSource}
            hasFile={!!current}
            saveStatus={saveStatus}
            saveStateLabel={saveStateLabel}
            saveStateTitle={saveStateTitle}
            onSaveStateClick={handleSaveStateClick}
            onCommitClick={handleCommitClick}
            commitDisabled={commitDisabled}
            commitTitle={commitTitle}
          />
        ) : (
          <div className="header-actions">
            <div className="header-group header-files" role="group" aria-label="File">
              <MenuButton
                ariaLabel="New"
                title="Create a new file or item"
                label={<span className="action-label">New</span>}
                icon={<Plus size={15} />}
                buttonClassName="new-menu"
                items={canCreate ? newItems() : []}
              />
              <button
                className="export-button"
                aria-label="Export"
                title={exportTitle}
                disabled={!hasSource}
                onClick={download}
              >
                <Download size={15} />
                <span className="action-label">Export</span>
              </button>
            </div>
            <div className="header-group header-state" role="group" aria-label="Save and commit">
              <button
                className={`save-state s-${saveStatus}`}
                role="status"
                aria-label="Save state"
                disabled={!current}
                title={saveStateTitle}
                onClick={handleSaveStateClick}
              >
                <span
                  className="save-state-text"
                  data-short={current && saveStateShort !== saveState ? saveStateShort : undefined}
                >
                  {saveStateLabel}
                </span>
              </button>
              <button
                className="primary"
                onClick={handleCommitClick}
                disabled={commitDisabled}
                title={commitTitle}
              >
                <GitCommitIcon size={15} />
                <span className="action-label">Commit…</span>
              </button>
            </div>
          </div>
        )}
        <div className="header-group header-account" role="group" aria-label="Account">
          {personMenu}
        </div>
      </header>
    </>
  );
});
