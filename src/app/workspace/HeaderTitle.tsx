/** The header's title block: the open file's name, and under it the project, kind and save state. */
import React from 'react';

type Props = {
  /** The open file's name, or null when no file is open. */
  fileName: string | null;
  /** The longer model name shown as the tooltip. */
  tooltip: string;
  projectName: string;
  kind: string;
  /** Whether the meta line is drawn; a phone has no room for it. */
  showMeta: boolean;
  /** The save state button, drawn at the end of the meta line. */
  saveState: React.ReactNode;
};

/** What the title says while no file is open. */
export const NO_FILE_TITLE = 'Open a file from Projects';

/** Renders the h1 and, for an open file when `showMeta` is set, the meta line below it. */
export function HeaderTitle({ fileName, tooltip, projectName, kind, showMeta, saveState }: Props) {
  const hasFile = fileName !== null;
  return (
    <div className="workspace-title">
      <h1 title={hasFile ? tooltip : NO_FILE_TITLE} className={hasFile ? '' : 'no-file'}>
        {hasFile ? fileName : NO_FILE_TITLE}
      </h1>
      {hasFile && showMeta && (
        <div className="header-meta">
          <span className="header-meta-text">{projectName}</span>
          <span aria-hidden="true">·</span>
          <span className="header-meta-text">{kind}</span>
          <span aria-hidden="true">·</span>
          {saveState}
        </div>
      )}
    </div>
  );
}
