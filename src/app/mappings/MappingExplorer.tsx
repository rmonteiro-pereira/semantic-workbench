/** The Mappings tab: the mapping of the open file, or the project's mappings that cover it. */
import React, { useEffect, useMemo, useState } from 'react';
import type { RuntimeContext } from '../../server/agent/runtime';
import { EmptyState } from '../projects/EmptyState';
import { apiFetch } from '../projects/api';
import { MappingSection } from './MappingSection';
import { agentCatalogPath, agentContextPath } from './agent-paths';
import { candidateMappings, coveringMappings, dataContractFilenames, isDefinedIn, type ProjectFile } from './mapping-scope';
import './mapping-explorer.css';

type MappingOption = {
  id: string;
  name: string;
  filename: string;
  embedded: boolean;
  project?: string;
};

type LoadedMapping = { option: MappingOption; context: RuntimeContext };

type Props = {
  currentId?: string;
  currentFilename?: string;
  /** The selected project; the tab shows its mappings only, and none when it is empty. */
  currentProject: string;
  projectName: string;
  /** The files of the open workspace; the data contracts among those of the project are the physical sources. */
  projectFiles: (ProjectFile & { project: string })[];
  revisionKey: string;
  dirty: boolean;
  onEditItem?: (docId: string, path: (string | number)[]) => void;
  /** Shows the source of the open file, where a binding is added. */
  onOpenSource?: (documentId: string) => void;
};

async function fetchJson(path: string, signal: AbortSignal) {
  const response = await apiFetch(path, { signal });
  const body = await response.json();
  if (!response.ok) throw Error(body.error);
  return body;
}

/** Loads the project's mapping list, then the context of each mapping that may cover the open file. */
function useProjectMappings(currentProject: string, currentId: string | undefined, revisionKey: string) {
  const [catalog, setCatalog] = useState<MappingOption[] | null>(null);
  const [loaded, setLoaded] = useState<LoadedMapping[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    setCatalog(null);
    setLoaded([]);
    setError('');
    if (!currentProject) return;
    const abort = new AbortController();
    async function load() {
      const body = await fetchJson(agentCatalogPath(currentProject), abort.signal);
      setCatalog(body.mappings);
      const candidates = candidateMappings<MappingOption>(body.mappings, currentProject, currentId);
      const contexts = await Promise.all(candidates.map(option => fetchJson(agentContextPath(currentProject, option.id), abort.signal)));
      setLoaded(candidates.map((option, index) => ({ option, context: contexts[index] })));
    }
    load().catch(failure => {
      if (failure.name !== 'AbortError') setError(failure.message);
    });
    return () => abort.abort();
  }, [revisionKey, currentId, currentProject]);
  return { catalog, loaded, error };
}

/** Says why there is no mapping to show, in one line. */
function NoMappings({ projectOpen, hasCatalog, fileName }: { projectOpen: boolean; hasCatalog: boolean; fileName: string }) {
  if (!projectOpen) {
    return <EmptyState title="Open a project">Mappings shows the mapping documents of the project whose file is open.</EmptyState>;
  }
  if (!hasCatalog) {
    return <EmptyState title="This project has no mapping document">Import an Ossie mapping document and its referenced ontology and semantic model, or load the mapped commerce example.</EmptyState>;
  }
  return <EmptyState title={`No mapping of this project covers ${fileName || 'the open file'}`} />;
}

/** Shows each mapping that is the open file or reads it, one after the other under its own name. */
export function MappingExplorer({ currentId, currentFilename, currentProject, projectName, projectFiles, revisionKey, dirty, onEditItem, onOpenSource }: Props) {
  const dataContractFiles = useMemo(() => dataContractFilenames(projectFiles.filter(file => file.project === currentProject)), [projectFiles, currentProject]);
  const { catalog, loaded, error } = useProjectMappings(currentProject, currentId, revisionKey);
  const shown = coveringMappings(
    loaded.map(entry => ({ ...entry, documents: entry.context.documents })),
    currentId,
  );
  const settled = catalog !== null && loaded.length === candidateMappings(catalog, currentProject, currentId).length;
  const hasCatalog = catalog !== null && catalog.some(option => option.project === currentProject);
  return (
    <div className="mapping-explorer">
      {currentProject && !settled && !error && <p role="status">Resolving saved layers</p>}
      {error && (
        <p role="alert" className="mapping-error">
          {error}
        </p>
      )}
      {(!currentProject || (settled && shown.length === 0)) && <NoMappings projectOpen={Boolean(currentProject)} hasCatalog={hasCatalog} fileName={currentFilename ?? ''} />}
      {shown.map(({ option, context }) => (
        <MappingSection
          key={option.id}
          context={context}
          mappingFile={option.filename}
          project={currentProject}
          projectName={projectName}
          openFileName={isDefinedIn(option, currentId) ? '' : (currentFilename ?? '')}
          dataContractFiles={dataContractFiles}
          revisionKey={revisionKey}
          dirty={dirty}
          onEditItem={onEditItem}
          onOpenSource={onOpenSource}
        />
      ))}
    </div>
  );
}
