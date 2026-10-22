/** Presentation and event handling for workspace sidebar. */
import { useCapabilities } from '../auth/Capabilities';
import { useMe } from '../auth/useMe';
import { useGitSetup } from '../scm/GitSetup';
import { FileCode, GitBranch, Layers, Network, Upload, X } from 'lucide-react';
import React from 'react';
import type { Doc, ProjectInfo, Suggestion } from '../projects/api';
import { api } from '../projects/api';
import type { DeleteTarget } from '../projects/DeleteDialog';
import type { TreeAction } from '../projects/Sidebar';
import { ProjectTree } from '../projects/Sidebar';
import { Suggestions } from '../projects/Suggestions';
import { ExampleList } from './ExampleList';

type Props = {
  compact: boolean;
  sidebarOpen: boolean;
  closeWorkspace: () => void;
  sidebarRef: React.RefObject<HTMLElement | null>;
  tab: string;
  setTab: (next: string) => void;
  setHistoryPath: React.Dispatch<React.SetStateAction<string | undefined>>;
  projects: ProjectInfo[];
  scmSlug: string;
  current: Doc | null;
  treeAction: (a: TreeAction) => void;
  docs: Doc[];
  openDocument: (d: Doc) => boolean;
  setDeleteTarget: React.Dispatch<React.SetStateAction<DeleteTarget | null>>;
  setTrashOpen: React.Dispatch<React.SetStateAction<boolean>>;
  suggestions: Suggestion[];
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  refresh: () => Promise<Doc[]>;
  examplesOpen: boolean;
  setExamplesChoice: React.Dispatch<React.SetStateAction<boolean | null>>;
  loadExample: (id: string) => Promise<void>;
  busy: boolean;
  setImporting: React.Dispatch<React.SetStateAction<{ project?: string | undefined } | null>>;
  importInput: React.RefObject<HTMLInputElement | null>;
  importInto: React.RefObject<string>;
  importIntoProject: (
    files: { path: string; source: string }[],
    onConflict?: 'replace' | 'keep-both' | undefined,
    slug?: string | undefined,
  ) => Promise<void>;
  importFiles: (files: File[]) => Promise<void>;
};
/** Renders workspace sidebar. */
export const WorkspaceSidebar = React.memo(function WorkspaceSidebar({
  compact,
  sidebarOpen,
  closeWorkspace,
  sidebarRef,
  tab,
  setTab,
  setHistoryPath,
  projects,
  scmSlug,
  current,
  treeAction,
  docs,
  openDocument,
  setDeleteTarget,
  setTrashOpen,
  suggestions,
  setMessage,
  refresh,
  examplesOpen,
  setExamplesChoice,
  loadExample,
  busy,
  setImporting,
  importInput,
  importInto,
  importIntoProject,
  importFiles,
}: Props) {
  const { me } = useMe();
  const access = useCapabilities();
  const openGitSetup = useGitSetup();
  function handleButtonClick() {
    setTab('fullgraph');
    if (compact) closeWorkspace();
  }

  function handleButtonClick2() {
    setTab('source');
    if (compact) closeWorkspace();
  }

  function handleButtonClick3() {
    setHistoryPath(undefined);
    setTab('scm');
    if (compact) closeWorkspace();
  }

  // The Remote dialog belongs to the Git setup dialogs; every other action goes to the workbench.
  function handleTreeAction(action: TreeAction) {
    const repo = projects.find(project => project.slug === action.project)?.repo;
    if (action.action === 'remote') openGitSetup({ kind: 'remote', project: action.project });
    else if (action.action === 'repository-projects' && repo)
      openGitSetup({ kind: 'repository-projects', repo });
    else treeAction(action);
  }

  function handleProjectTreeOpen(project: string, path: string) {
    const document = docs.find(x => x.project === project && x.path === path);
    if (document) openDocument(document);
  }

  function handleSuggestionsAccept(id: string) {
    return void api
      .acceptSuggestion(id)
      .then(r => {
        setMessage(`Moved ${r.path} into ${projects.find(p => p.slug === r.project)?.name}.`);
        return refresh();
      })
      .catch(e => setMessage(e.message));
  }

  function handleSuggestionsReject(id: string) {
    return void api
      .rejectSuggestion(id)
      .then(() => refresh())
      .catch(e => setMessage(e.message));
  }

  function handleImportInputChange(e: React.ChangeEvent<HTMLInputElement, HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const into = importInto.current;
    importInto.current = '';
    e.target.value = '';
    if (into)
      void Promise.all(files.map(async f => ({ path: f.name, source: await f.text() }))).then(
        list => {
          if (list.length) void importIntoProject(list, undefined, into);
        },
      );
    else void importFiles(files);
  }

  return (
    <>
      {compact && sidebarOpen && (
        <button
          className="workspace-scrim"
          aria-label="Dismiss workspace drawer"
          tabIndex={-1}
          onClick={closeWorkspace}
        />
      )}
      <aside
        id="workspace-sidebar"
        className="sidebar workspace-sidebar"
        ref={sidebarRef}
        inert={!sidebarOpen}
        role={compact && sidebarOpen ? 'dialog' : undefined}
        aria-modal={compact && sidebarOpen ? true : undefined}
        aria-label="Workspace documents"
      >
        {compact && (
          <button
            className="workspace-close"
            aria-label="Close workspace drawer"
            onClick={closeWorkspace}
          >
            <X size={18} />
          </button>
        )}
        <div className="brand">
          <Layers size={26} />
          <span>
            semantic<span className="brand-sub">WORKBENCH</span>
          </span>
        </div>
        <div className="workspace-label">
          {me?.mode === 'server' ? 'SHARED WORKSPACE' : 'LOCAL WORKSPACE'} <span className="dot" />
        </div>
        <button
          className={`nav${tab !== 'scm' && tab !== 'source' ? ' active' : ''}`}
          aria-current={tab !== 'scm' && tab !== 'source' ? 'page' : undefined}
          onClick={handleButtonClick}
        >
          <Network size={18} /> Model explorer
        </button>
        <button
          className={`nav${tab === 'source' ? ' active' : ''}`}
          aria-current={tab === 'source' ? 'page' : undefined}
          onClick={handleButtonClick2}
        >
          <FileCode size={18} /> Source editor
        </button>
        <button
          className={`nav${tab === 'scm' ? ' active' : ''}`}
          aria-current={tab === 'scm' ? 'page' : undefined}
          onClick={handleButtonClick3}
        >
          <GitBranch size={18} /> Source control
          {(() => {
            const count = projects.find(p => p.slug === scmSlug)?.changes ?? 0;
            return (
              count > 0 && (
                <span className="nav-count" aria-label={`${count} changed files`}>
                  {count}
                </span>
              )
            );
          })()}
        </button>
        <div className="section-label">
          PROJECTS <span>{projects.length}</span>
        </div>
        <div className="documents">
          <ProjectTree
            projects={projects}
            currentId={current?.id}
            onAction={handleTreeAction}
            onOpen={handleProjectTreeOpen}
          />
        </div>
        <div className="workspace-actions">
          <button
            onClick={() => setDeleteTarget({ kind: 'clear' })}
            disabled={!projects.length || !access.can('clear')}
            title={access.control('clear').title}
          >
            Clear workspace
          </button>
          <button onClick={() => setTrashOpen(true)}>Trash</button>
        </div>
        <Suggestions
          items={suggestions}
          projects={projects}
          onAccept={handleSuggestionsAccept}
          onReject={handleSuggestionsReject}
        />
        {access.can('createProject') && (
          <ExampleList
            examplesOpen={examplesOpen}
            setExamplesChoice={setExamplesChoice}
            loadExample={loadExample}
            busy={busy}
          />
        )}
        <button
          hidden={!access.can('createProject')}
          className="import"
          onClick={() => setImporting({})}
        >
          <Upload size={16} /> Import…
        </button>
        {/* The one file field: the Import dialog opens it for a new or an existing project. */}
        <input
          ref={importInput}
          className="import-input"
          type="file"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          accept=".yaml,.yml,.json,.odcs,.ossie,.ttl,.nt,.rdf,.owl,.xml,.shacl,.n3"
          onChange={handleImportInputChange}
        />
        <div className="local">
          <span className="dot" /> Project folders · on your machine
          <small>Your definitions stay local.</small>
        </div>
      </aside>
    </>
  );
});
