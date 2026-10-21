/** Presentation and event handling for workspace canvas. */
import { Network } from 'lucide-react';
import React from 'react';
import type { KpiSummary } from '../../server/agent/explain';
import type { Issue } from '../diagnostics';
import type { Path } from '../edit/item-model';
import type { Saved } from '../edit/ItemEditor';
import type { CodeEditorHandle } from '../editor/CodeEditor';
import type { Fullscreen } from '../graph/fullscreen';
import type { Walk, WalkAction } from '../graph/walk';
import { MappingExplorer } from '../MappingExplorer';
import type { Entity } from '../model';
import type { CrossFileTarget } from '../NeighborhoodGraph';
import type { LineageCard, LineageGraph } from '../odcs/lineage';
import type { GroupingOptions, modelOverview } from '../overview';
import type { Doc, ProjectInfo } from '../projects/api';
import type { AutosaveState } from '../projects/autosave';
import type { ImportDraft } from '../ValidationPanel';
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
  source: string;
  historyPath: string | undefined;
  setScmProject: React.Dispatch<React.SetStateAction<string | null>>;
  setHistoryPath: React.Dispatch<React.SetStateAction<string | undefined>>;
  refresh: () => Promise<Doc[]>;
  docsRef: React.RefObject<Map<string, Doc>>;
  openDocument: (d: Doc) => boolean;
  setTab: (next: string) => void;
  kpiProject: string | null;
  kpis: KpiSummary[];
  kpiError: string;
  kpiLoading: boolean;
  selectedKpi: string;
  setSelectedKpi: React.Dispatch<React.SetStateAction<string>>;
  kpiFilter: string;
  setWizard: React.Dispatch<React.SetStateAction<boolean | KpiSummary>>;
  editKpi: (k: KpiSummary) => void;
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
  result: { model: ValidatedModel; error: string };
  search: string;
  selectEntity: (id: string) => void;
  kpiBadges: Map<string, string[]>;
  entityTarget: (e: Entity) => ItemTarget | null;
  rdfTarget: (e: Entity) => RdfTarget | null;
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
  crossFile: (e: Entity) => CrossFileTarget[];
  crossTo: (t: CrossFileTarget) => void;
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
  scmSlug,
  setGitBusy,
  autosave,
  setCommitting,
  projects,
  source,
  historyPath,
  setScmProject,
  setHistoryPath,
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
}: Props) {
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
          setMessage={setMessage}
        />
      );
    }
    if (tab === 'scm') {
      return (
        <SourceControlView
          scmSlug={scmSlug}
          setGitBusy={setGitBusy}
          autosave={autosave}
          setCommitting={setCommitting}
          projects={projects}
          gitVersion={gitVersion}
          current={current}
          source={source}
          historyPath={historyPath}
          setMessage={setMessage}
          setScmProject={setScmProject}
          setHistoryPath={setHistoryPath}
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
          currentId={current?.id}
          revisionKey={docs.map(d => d.id + ':' + d.hash).join('|')}
          dirty={!!current && source !== current.source}
        />
      );
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
        />
      );
    }
    if (plainText) {
      return (
        <div className="invalid-definition">
          <h2>Git ignore rules</h2>
          <p>
            {current?.path} is plain text: one pattern per line, read by Git. Files it matches are
            not shown in the workspace or in Source Control.
          </p>
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
        setSearch={setSearch}
        showNeighborhood={showNeighborhood}
        handleModelOverviewSelectRelationship={handleModelOverviewSelectRelationship}
        docsRef={docsRef}
        walk={walk}
        handleNeighborhoodGraphWalk={handleNeighborhoodGraphWalk}
        walkTo={walkTo}
        handleNeighborhoodGraphSelectEntity={handleNeighborhoodGraphSelectEntity}
        setSelectedEdge={setSelectedEdge}
        handleNeighborhoodGraphFullGraph={handleNeighborhoodGraphFullGraph}
        handleNeighborhoodGraphOpenKpis={handleNeighborhoodGraphOpenKpis}
        crossFile={crossFile}
        crossTo={crossTo}
      />
    );
  }

  function handlePrimaryClick() {
    return void commitImports([{ filename: 'commerce-business.ossie.yaml', source: sample }]).catch(
      e => setMessage((e as Error).message),
    );
  }

  function handleLineageCanvasOpenAsset(c: import('../odcs/lineage').LineageCard) {
    setTab('contract');
    setContractObject(c.label);
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

  function handleNeighborhoodGraphFullGraph() {
    setSearch('');
    setTab('fullgraph');
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
