/** Presentation and event handling for source control view. */
import React from 'react';
import type { Doc, ProjectInfo } from '../projects/api';
import type { AutosaveState } from '../projects/autosave';
import { SourceControl } from '../scm/SourceControl';

type Props = {
  scmSlug: string;
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
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  setScmProject: React.Dispatch<React.SetStateAction<string | null>>;
  setHistoryPath: React.Dispatch<React.SetStateAction<string | undefined>>;
  refresh: () => Promise<Doc[]>;
  docsRef: React.RefObject<Map<string, Doc>>;
  openDocument: (d: Doc) => boolean;
  setTab: (next: string) => void;
};
/** Renders source control view. */
export function SourceControlView({
  scmSlug,
  setGitBusy,
  autosave,
  setCommitting,
  projects,
  gitVersion,
  current,
  source,
  historyPath,
  setMessage,
  setScmProject,
  setHistoryPath,
  refresh,
  docsRef,
  openDocument,
  setTab,
}: Props) {
  function handleSourceControlProject(slug: string) {
    setMessage('');
    setScmProject(slug);
    setHistoryPath(undefined);
  }

  function handleSourceControlOpen(project: string, path: string) {
    const document = docsRef.current.get(`${project}/${path}`);
    if (document && openDocument(document)) setTab('source');
  }

  return scmSlug ? (
    <SourceControl
      onBusy={setGitBusy}
      onCommit={() => {
        void autosave.flush();
        setCommitting(true);
      }}
      projects={projects}
      project={scmSlug}
      version={gitVersion}
      unsaved={
        current && current.project === scmSlug && source !== current.source ? [current.path] : []
      }
      historyPath={historyPath}
      onProject={handleSourceControlProject}
      onChanged={() => void refresh().catch(() => {})}
      onOpen={handleSourceControlOpen}
    />
  ) : (
    <p className="hint">Import definitions or load an example to start a project.</p>
  );
}
