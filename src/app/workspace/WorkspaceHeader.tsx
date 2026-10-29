/** Presentation and event handling for workspace header. */
import './WorkspaceHeader.css';
import { useCapabilities } from '../auth/Capabilities';
import { Menu, PanelLeft, X } from 'lucide-react';
import React from 'react';
import type { Doc, ProjectInfo, WorkspaceStatus } from '../projects/api';
import { saveNeedsAction, type AutosaveStatus } from '../projects/autosave';
import type { MenuItem } from '../projects/Menu';
import { HeaderActions } from './HeaderActions';
import { hasNothingToCommit, NOTHING_TO_COMMIT, SAVE_FAILED } from './commit-availability';
import { HeaderTitle } from './HeaderTitle';
import { SaveStateButton } from './SaveStateButton';
import type { ValidatedModel } from './types';
import { usePhoneScreen } from './hooks/useNarrowScreen';

type Props = {
  personMenu?: React.ReactNode;
  workspaceToggle: React.RefObject<HTMLButtonElement | null>;
  compact: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSidebarHidden: React.Dispatch<React.SetStateAction<boolean>>;
  model: ValidatedModel;
  current: Doc | null;
  /** Every project, to show the open file's project by its display name. */
  projects: ProjectInfo[];
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
  projects,
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
  // A file that cannot be parsed has no model, so the header keeps the kind it showed while the file was valid.
  const [lastKind, setLastKind] = React.useState<{ fileId: string; kind: string } | null>(null);
  React.useEffect(() => {
    if (current && model?.kind) setLastKind({ fileId: current.id, kind: model.kind });
  }, [current?.id, model?.kind]);
  const keptKind = lastKind?.fileId === current?.id ? lastKind?.kind : undefined;
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
    return <PanelLeft size={18} />;
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

  function commitDisabledTitle() {
    if (saveFailed) return SAVE_FAILED;
    if (nothingToCommit) return NOTHING_TO_COMMIT;
    return getCommitTitle();
  }

  const canCreate = access.can('edit');
  const exportTitle = hasSource ? 'Download the file exactly as it is' : 'Open a file to export it.';
  const saveStateLabel = current ? saveState : 'No file open';
  const saveStateTitle = `${saveStateLabel} — ${getSaveStateAction()}`;
  const uncommittedFiles = projects.find(project => project.slug === current?.project)?.changes ?? 0;
  const nothingToCommit = !!current && hasNothingToCommit(uncommittedFiles, saveStatus);
  const saveFailed = !!current && saveNeedsAction(saveStatus);
  const commitDisabled = !current || status?.gitAvailable === false || !access.can('commit') || nothingToCommit || saveFailed;
  const commitTitle = access.control('commit').title ?? commitDisabledTitle();

  const saveStateButton = <SaveStateButton variant={isPhone ? 'dot' : 'inline'} status={saveStatus} hasFile={!!current} label={saveStateLabel} title={saveStateTitle} onClick={handleSaveStateClick} />;

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
        <HeaderTitle
          fileName={current?.filename ?? null}
          tooltip={model?.name ?? current?.filename ?? ''}
          kind={model?.kind ?? keptKind ?? 'ODCS + Apache Ossie'}
          showMeta={!isPhone}
          saveState={saveStateButton}
        />
        <HeaderActions
          leadingStatus={isPhone ? saveStateButton : undefined}
          newItems={canCreate ? newItems() : []}
          newTitle="Create a new file or item"
          newDisabled={canCreate ? false : 'Your role cannot create items here.'}
          download={download}
          exportTitle={exportTitle}
          exportDisabled={!hasSource}
          hasFile={!!current}
          onCommitClick={handleCommitClick}
          commitDisabled={commitDisabled}
          commitTitle={commitTitle}
          uncommittedCount={uncommittedFiles}
        />
        <div className="header-group header-account" role="group" aria-label="Account">
          {personMenu}
        </div>
      </header>
    </>
  );
});
