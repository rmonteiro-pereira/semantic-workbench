/** Presentation and event handling for source control view. */
import React from 'react';
import type { Doc, ProjectInfo } from '../projects/api';
import type { AutosaveState } from '../projects/autosave';
import { SourceControl } from '../scm/SourceControl';

type Props = {
  project: string;
  setGitBusy: React.Dispatch<React.SetStateAction<boolean>>;
  autosave: {
    state: AutosaveState;
    flush(): Promise<void>;
    resolved: (hash: string | null, text: string) => void;
    cancel: () => void;
  };
  setCommitting: React.Dispatch<React.SetStateAction<boolean>>;
  projects: ProjectInfo[];
  gitVersion: number;
  current: Doc | null;
  source: string;
  historyPath: string | undefined;
  refresh: () => Promise<Doc[]>;
  docsRef: React.RefObject<Map<string, Doc>>;
  openDocument: (d: Doc) => boolean;
  setTab: (next: string) => void;
};
/** Renders source control view. */
export function SourceControlView({ project, setGitBusy, autosave, setCommitting, projects, gitVersion, current, source, historyPath, refresh, docsRef, openDocument, setTab }: Props) {
  function handleSourceControlOpen(project: string, path: string) {
    const document = docsRef.current.get(`${project}/${path}`);
    if (document && openDocument(document)) setTab('source');
  }

  return project ? (
    <SourceControl
      onBusy={setGitBusy}
      onCommit={() => {
        void autosave.flush();
        setCommitting(true);
      }}
      projects={projects}
      project={project}
      version={gitVersion}
      unsaved={current && current.project === project && source !== current.source ? [current.path] : []}
      historyPath={historyPath}
      onChanged={() => void refresh().catch(() => {})}
      onOpen={handleSourceControlOpen}
    />
  ) : (
    <p className="hint">Import definitions or load an example to start a project.</p>
  );
}
