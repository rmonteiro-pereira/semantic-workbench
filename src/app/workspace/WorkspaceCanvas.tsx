/** Presentation and event handling for workspace canvas. */
import { Network } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { AreaFilter } from '../graph/overview';
import type { KpiSummary } from '../../server/agent/explain';
import type { Issue } from '../../shared/validation/diagnostics';
import type { Path } from '../../shared/edit/item-model';
import type { Saved } from '../edit/ItemEditor';
import type { CodeEditorHandle } from '../editor/CodeEditor';
import type { Fullscreen } from '../graph/fullscreen';
import type { Walk, WalkAction } from '../graph/walk';
import { projectRevisionKey } from '../../shared/core/selected-project';
import { MappingExplorer } from '../mappings/MappingExplorer';
import type { Entity } from '../../shared/core/model';
import type { CrossFileTarget } from '../graph/NeighborhoodGraph';
import type { LineageCard, LineageGraph } from '../odcs/lineage';
import type { GroupingOptions, modelOverview } from '../graph/overview';
import type { Doc, ProjectInfo } from '../projects/api';
import type { AutosaveState } from '../projects/autosave';
import type { ImportDraft } from '../validation/ValidationPanel';
import { EmptyProject } from './EmptyProject';
import { CatalogView } from './CatalogView';
import { ContractView } from './ContractView';
import { GraphViews } from './GraphViews';
import { MetricsPanel } from './MetricsPanel';
import { SourceControlView } from './SourceControlView';
import { SourceView } from './SourceView';
import type { ItemTarget, RdfTarget, ValidatedModel } from './types';

type Props = {
  pageDetails: boolean;
  tab: string;
  isContract: boolean;
  current: Doc | null;
  contractObject: string | null;
  model: ValidatedModel;
  docs: Doc[];
  setContractObject: React.Dispatch<React.SetStateAction<string | null>>;
  openInLineage: (name: string) => void;
  continueInNeighborhood: (card: LineageCard) => void;
  gitVersion: number;
  docText: (id: string) => string;
  applySaved: (saved: Saved[], label: string) => void;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
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
  source: string;
  historyPath: string | undefined;
  refresh: () => Promise<Doc[]>;
  docsRef: React.RefObject<Map<string, Doc>>;
  openDocument: (doc: Doc) => boolean;
  setTab: (next: string) => void;
  kpiProject: string | null;
  kpis: KpiSummary[];
  kpiError: string;
  kpiLoading: boolean;
  selectedKpi: string;
  setSelectedKpi: React.Dispatch<React.SetStateAction<string>>;
  kpiFilter: string;
  setWizard: React.Dispatch<React.SetStateAction<boolean | KpiSummary>>;
  editKpi: (kpiSummary: KpiSummary) => void;
  editMappingItem: (docId: string, path: Path) => void;
  commitImports: (drafts: ImportDraft[]) => Promise<void>;
  sample: string;
  sourceEditor: React.RefObject<CodeEditorHandle | null>;
  setSource: React.Dispatch<React.SetStateAction<string>>;
  setEditorIssues: React.Dispatch<
    React.SetStateAction<{
      id?: string | undefined;
      issues: Issue[];
      text?: string | undefined;
    } | null>
  >;
  plainText: boolean;
  assumeOssieVersion: boolean;
  validateAsShippedVersion: () => void;
  result: { model: ValidatedModel; error: string };
  search: string;
  selectEntity: (id: string) => void;
  kpiBadges: Map<string, string[]>;
  entityTarget: (entity: Entity) => ItemTarget | null;
  rdfTarget: (entity: Entity) => RdfTarget | null;
  setEditing: React.Dispatch<React.SetStateAction<ItemTarget | null>>;
  setRdfEditing: React.Dispatch<React.SetStateAction<RdfTarget | null>>;
  mappingId: string;
  mappingView: 'mapping' | 'ontology';
  fullscreen: Fullscreen;
  graphViewSwitch: React.JSX.Element | null;
  lineage: LineageGraph | null;
  lineageCenterId: string;
  lineageCenterChanged: (id: string) => void;
  groupingOverview: ReturnType<typeof modelOverview> | null;
  grouping: { value: GroupingOptions; error: string; change: (value: GroupingOptions) => void };
  selected: string;
  selectedEdge: string;
  setSelectedEdge: React.Dispatch<React.SetStateAction<string>>;
  setSelected: React.Dispatch<React.SetStateAction<string>>;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  showNeighborhood: (id?: string) => void;
  walk: Walk;
  dispatchWalk: React.ActionDispatch<[action: WalkAction]>;
  walkTo: (index: number) => void;
  setKpiFilter: React.Dispatch<React.SetStateAction<string>>;
  crossFile: (entity: Entity) => CrossFileTarget[];
  crossTo: (crossFileTarget: CrossFileTarget) => void;
  /** A project the person opened that has no definitions, shown instead of the welcome text. */
  emptyProject?: ProjectInfo;
  onImportInto: (slug: string) => void;
};
/** Renders workspace canvas. */
export function WorkspaceCanvas({
  pageDetails,
  tab,
  isContract,
  current,
  contractObject,
  model,
  docs,
  setContractObject,
  openInLineage,
  continueInNeighborhood,
  gitVersion,
  docText,
  applySaved,
  setMessage,
  project,
  setGitBusy,
  autosave,
  setCommitting,
  projects,
  source,
  historyPath,
  refresh,
  docsRef,
  openDocument,
  setTab,
  kpiProject,
  kpis,
  kpiError,
  kpiLoading,
  selectedKpi,
  setSelectedKpi,
  kpiFilter,
  setWizard,
  editKpi,
  editMappingItem,
  commitImports,
  sample,
  sourceEditor,
  setSource,
  setEditorIssues,
  plainText,
  assumeOssieVersion,
  validateAsShippedVersion,
  result,
  search,
  selectEntity,
  kpiBadges,
  entityTarget,
  rdfTarget,
  setEditing,
  setRdfEditing,
  mappingId,
  mappingView,
  fullscreen,
  graphViewSwitch,
  lineage,
  lineageCenterId,
  lineageCenterChanged,
  groupingOverview,
  grouping,
  selected,
  selectedEdge,
  setSelectedEdge,
  setSelected,
  setSearch,
  showNeighborhood,
  walk,
  dispatchWalk,
  walkTo,
  setKpiFilter,
  crossFile,
  crossTo,
  emptyProject,
  onImportInto,
}: Props) {
  // "Show all" on an Overview card opens the Catalog filtered to that area. The filter ends when
  // the user leaves the Catalog, so the next visit lists everything again.
  const [catalogArea, setCatalogArea] = useState<AreaFilter | null>(null);
  useEffect(() => {
    if (tab !== 'catalog') setCatalogArea(null);
  }, [tab]);
  function showAreaInCatalog(area: AreaFilter) {
    setCatalogArea(area);
    setTab('catalog');
  }
  function openMappingSource(documentId: string) {
    const document = docs.find(candidate => candidate.id === documentId);
    if (document && openDocument(document)) setTab('source');
  }
  function renderCanvasView() {
    if (tab === 'contract' && isContract && current) {
      return (
        <ContractView
          contractObject={contractObject}
          current={current}
          model={model}
          docs={docs}
          setContractObject={setContractObject}
          openInLineage={openInLineage}
          continueInNeighborhood={continueInNeighborhood}
          gitVersion={gitVersion}
          docText={docText}
          applySaved={applySaved}
          onOpenSource={() => setTab('source')}
        />
      );
    }
    if (tab === 'scm') {
      return (
        <SourceControlView
          project={project}
          setGitBusy={setGitBusy}
          autosave={autosave}
          setCommitting={setCommitting}
          projects={projects}
          gitVersion={gitVersion}
          current={current}
          source={source}
          historyPath={historyPath}
          refresh={refresh}
          docsRef={docsRef}
          openDocument={openDocument}
          setTab={setTab}
        />
      );
    }
    if (tab === 'metrics') {
      return (
        <MetricsPanel
          kpiProject={kpiProject}
          projects={projects}
          kpis={kpis}
          kpiError={kpiError}
          kpiLoading={kpiLoading}
          selectedKpi={selectedKpi}
          setSelectedKpi={setSelectedKpi}
          kpiFilter={kpiFilter}
          setWizard={setWizard}
          editKpi={editKpi}
        />
      );
    }
    if (tab === 'mappings') {
      return (
        <MappingExplorer
          onEditItem={editMappingItem}
          onOpenSource={openMappingSource}
          currentId={current?.id}
          currentFilename={current?.filename}
          currentProject={project}
          projectName={projects.find(info => info.slug === project)?.name ?? project}
          projectFiles={docs}
          revisionKey={projectRevisionKey(docs, project)}
          dirty={!!current && source !== current.source}
        />
      );
    }
    if (!source && !current && emptyProject) {
      return <EmptyProject project={emptyProject} onImportFiles={() => onImportInto(emptyProject.slug)} />;
    }
    if (!source && !current) {
      return (
        <div className="empty">
          <div className="empty-icon">
            <Network size={36} />
          </div>
          <h2>Give your data a shared language.</h2>
          <p>
            Import a contract, semantic model, or ontology.
            <br />
            Explore its relationships and edit its definitions.
          </p>
          <button className="primary" onClick={handlePrimaryClick}>
            Open example ontology
          </button>
        </div>
      );
    }
    if (tab === 'source') {
      return (
        <SourceView
          sourceEditor={sourceEditor}
          current={current}
          source={source}
          setSource={setSource}
          setEditorIssues={setEditorIssues}
          assumeOssieVersion={assumeOssieVersion}
          validateAsShippedVersion={validateAsShippedVersion}
        />
      );
    }
    if (plainText) {
      return (
        <div className="invalid-definition">
          <h2>Git ignore rules</h2>
          <p>{current?.path} is plain text: one pattern per line, read by Git. Files it matches are not shown in the workspace or in Source Control.</p>
          <button onClick={() => setTab('source')}>Edit in Source</button>
        </div>
      );
    }
    if (result.error) {
      return (
        <div className="invalid-definition">
          <h2>This definition needs repair</h2>
          <p>Your saved document is unchanged. Open Source to fix the validation findings.</p>
          <button onClick={() => setTab('source')}>Repair in Source</button>
        </div>
      );
    }
    if (tab === 'catalog') {
      return (
        <CatalogView
          model={model}
          search={search}
          area={catalogArea}
          clearArea={() => setCatalogArea(null)}
          selectEntity={selectEntity}
          kpiBadges={kpiBadges}
          entityTarget={entityTarget}
          rdfTarget={rdfTarget}
          setEditing={setEditing}
          setRdfEditing={setRdfEditing}
        />
      );
    }
    return (
      <GraphViews
        tab={tab}
        mappingId={mappingId}
        mappingView={mappingView}
        docs={docs}
        current={current}
        source={source}
        fullscreen={fullscreen}
        graphViewSwitch={graphViewSwitch}
        editMappingItem={editMappingItem}
        isContract={isContract}
        lineage={lineage}
        lineageCenterId={lineageCenterId}
        lineageCenterChanged={lineageCenterChanged}
        handleLineageCanvasOpenAsset={handleLineageCanvasOpenAsset}
        continueInNeighborhood={continueInNeighborhood}
        model={model}
        kpiBadges={kpiBadges}
        groupingOverview={groupingOverview}
        grouping={grouping}
        selected={selected}
        selectedEdge={selectedEdge}
        search={search}
        selectEntity={selectEntity}
        handleFullGraphSelectEdge={handleFullGraphSelectEdge}
        setTab={setTab}
        showAreaInCatalog={showAreaInCatalog}
        setSearch={setSearch}
        showNeighborhood={showNeighborhood}
        handleModelOverviewSelectRelationship={handleModelOverviewSelectRelationship}
        docsRef={docsRef}
        walk={walk}
        handleNeighborhoodGraphWalk={handleNeighborhoodGraphWalk}
        walkTo={walkTo}
        handleNeighborhoodGraphSelectEntity={handleNeighborhoodGraphSelectEntity}
        setSelectedEdge={setSelectedEdge}
        handleNeighborhoodGraphOpenKpis={handleNeighborhoodGraphOpenKpis}
        crossFile={crossFile}
        crossTo={crossTo}
        onStatus={setMessage}
      />
    );
  }

  function handlePrimaryClick() {
    return void commitImports([{ filename: 'commerce-business.ossie.yaml', source: sample }]).catch(e => setMessage((e as Error).message));
  }

  function handleLineageCanvasOpenAsset(lineageCard: import('../odcs/lineage').LineageCard) {
    setTab('contract');
    setContractObject(lineageCard.label);
  }

  function handleFullGraphSelectEdge(id: string) {
    setSelectedEdge(id);
    setSelected('');
  }

  function handleModelOverviewSelectRelationship(id: string) {
    setSelectedEdge(id);
    setSelected('');
  }

  function handleNeighborhoodGraphWalk(steps: import('../graph/walk').WalkStep[]) {
    for (const step of steps) dispatchWalk({ type: 'push', step });
  }

  function handleNeighborhoodGraphSelectEntity(id: string) {
    setSelected(id);
    setSelectedEdge('');
  }

  function handleNeighborhoodGraphOpenKpis(concept: string) {
    setKpiFilter(concept + '\u0000' + Date.now());
    setSelectedKpi('');
    setTab('metrics');
  }

  return (
    <>
      <section className="canvas" inert={pageDetails}>
        {renderCanvasView()}
      </section>
    </>
  );
}
