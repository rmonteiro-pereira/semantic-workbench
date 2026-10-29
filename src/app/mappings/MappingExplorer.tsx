/** The Mappings tab: the mapping of the open file, or the project's mappings that cover it. */
import React, { useEffect, useMemo, useState } from 'react';
import type { SelectedContext } from '../../server/agent/runtime';
import { EmptyState } from '../projects/EmptyState';
import { api, type AgentMapping, type Doc } from '../projects/api';
import { MappingSection } from './MappingSection';
import { candidateMappings, coveringMappings, dataContractFilenames, isDefinedIn } from './mapping-scope';
import './mapping-explorer.css';

type MappingOption = AgentMapping;

/** A mapping of the project with its context, or the reason the context could not be loaded. */
type LoadedMapping = { option: MappingOption; context?: SelectedContext; error?: string };

type Props = {
  currentId?: string;
  currentFilename?: string;
  /** The selected project; the tab shows its mappings only, and none when it is empty. */
  currentProject: string;
  projectName: string;
  /** The files of the open workspace; the data contracts among those of the project are the physical sources. */
  projectFiles: Doc[];
  revisionKey: string;
  dirty: boolean;
  onEditItem?: (docId: string, path: (string | number)[]) => void;
  /** Shows the source of the open file, where a binding is added. */
  onOpenSource?: (documentId: string) => void;
};

function loadedMapping(option: MappingOption, result: PromiseSettledResult<SelectedContext>): LoadedMapping {
  if (result.status === 'fulfilled') return { option, context: result.value };
  return { option, error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
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
      const body = await api.agentCatalog(currentProject, abort.signal);
      setCatalog(body.mappings);
      const candidates = candidateMappings<MappingOption>(body.mappings, currentProject, currentId);
      const results = await Promise.allSettled(candidates.map(option => api.agentContext(currentProject, option.id, undefined, abort.signal)));
      if (abort.signal.aborted) return;
      setLoaded(candidates.map((option, index) => loadedMapping(option, results[index])));
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

/** Names a mapping whose context could not be loaded and says why, so the healthy mappings still show. */
function MappingFailure({ name, message }: { name: string; message: string }) {
  return (
    <section className="mapping-page" aria-label={name}>
      <h2>{name}</h2>
      <p role="alert" className="mapping-error">
        {message}
      </p>
    </section>
  );
}

/** Shows each mapping that is the open file or reads it, one after the other under its own name. */
export function MappingExplorer({ currentId, currentFilename, currentProject, projectName, projectFiles, revisionKey, dirty, onEditItem, onOpenSource }: Props) {
  const dataContractFiles = useMemo(() => dataContractFilenames(projectFiles.filter(file => file.project === currentProject)), [projectFiles, currentProject]);
  const { catalog, loaded, error } = useProjectMappings(currentProject, currentId, revisionKey);
  const healthy = loaded.flatMap(({ option, context }) => (context ? [{ option, context, documents: context.documents }] : []));
  const shown = coveringMappings(healthy, currentId);
  // A mapping that failed to load cannot say which files it reads, so its error is always shown under its name.
  const failed = loaded.filter(entry => entry.error !== undefined);
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
      {failed.map(({ option, error: message }) => (
        <MappingFailure key={option.id} name={option.name} message={message ?? ''} />
      ))}
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
