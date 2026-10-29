/** Presentation and event handling for graph views. */
import React, { useCallback, useMemo } from 'react';
import { FullGraph } from '../graph/FullGraph';
import { projectRevisionKey } from '../../shared/core/selected-project';
import { MappingCanvas } from '../mappings/MappingCanvas';
import { ModelOverview } from '../graph/ModelOverview';
import { GroupingControls } from '../graph/GroupingControls';
import { NeighborhoodGraph } from '../graph/NeighborhoodGraph';
import { LineageCanvas } from '../odcs/LineageCanvas';
import type { LineageCard } from '../odcs/lineage';
import type { AreaFilter, modelOverview } from '../graph/overview';

type GroupLook = { name: string; color: string };

// Each entity's group name and colour under the current Group by choice.
function groupLooks(overview: ReturnType<typeof modelOverview> | null) {
  const looks = new Map<string, GroupLook>();
  for (const group of overview?.groups ?? []) for (const entity of group.entities) looks.set(entity.id, group);
  return looks;
}

type Props = {
  tab: string;
  mappingId: string;
  mappingView: 'mapping' | 'ontology';
  docs: import('../projects/api').Doc[];
  current: import('../projects/api').Doc | null;
  source: string;
  fullscreen: import('../graph/fullscreen').Fullscreen;
  graphViewSwitch: React.JSX.Element | null;
  editMappingItem: (docId: string, path: import('../../shared/edit/item-model').Path) => void;
  isContract: boolean;
  lineage: import('../odcs/lineage').LineageGraph | null;
  lineageCenterId: string;
  lineageCenterChanged: (id: string) => void;
  handleLineageCanvasOpenAsset: (lineageCard: import('../odcs/lineage').LineageCard) => void;
  continueInNeighborhood: (card: import('../odcs/lineage').LineageCard) => void;
  model:
    | {
        kind: string;
        name: any;
        entities: import('../../shared/core/model').Entity[];
        edges: import('../../shared/core/model').Relationship[];
        issues: import('../../shared/validation/diagnostics').Issue[];
      }
    | {
        kind: string;
        layout: string | undefined;
        name: any;
        entities: import('../../shared/core/model').Entity[];
        edges: import('../../shared/core/model').Relationship[];
        issues: import('../../shared/validation/diagnostics').Issue[];
        document: any;
      }
    | null;
  kpiBadges: Map<string, string[]>;
  groupingOverview: ReturnType<typeof modelOverview> | null;
  grouping: {
    value: import('../graph/overview').GroupingOptions;
    error: string;
    change: (value: import('../graph/overview').GroupingOptions) => void;
  };
  selected: string;
  selectedEdge: string;
  search: string;
  selectEntity: (id: string) => void;
  handleFullGraphSelectEdge: (id: string) => void;
  setTab: (next: string) => void;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  showNeighborhood: (id?: string | undefined) => void;
  handleModelOverviewSelectRelationship: (id: string) => void;
  showAreaInCatalog: (area: AreaFilter) => void;
  docsRef: React.RefObject<Map<string, import('../projects/api').Doc>>;
  walk: import('../graph/walk').Walk;
  handleNeighborhoodGraphWalk: (steps: import('../graph/walk').WalkStep[]) => void;
  walkTo: (index: number) => void;
  handleNeighborhoodGraphSelectEntity: (id: string) => void;
  setSelectedEdge: React.Dispatch<React.SetStateAction<string>>;
  handleNeighborhoodGraphOpenKpis: (concept: string) => void;
  crossFile: (entity: import('../../shared/core/model').Entity) => import('../graph/NeighborhoodGraph').CrossFileTarget[];
  crossTo: (crossFileTarget: import('../graph/NeighborhoodGraph').CrossFileTarget) => void;
  /** Posts a short message to the workspace's status line. */
  onStatus: (message: string) => void;
};
/** Renders graph views. */
export function GraphViews({
  tab,
  mappingId,
  mappingView,
  docs,
  current,
  source,
  fullscreen,
  graphViewSwitch,
  editMappingItem,
  isContract,
  lineage,
  lineageCenterId,
  lineageCenterChanged,
  handleLineageCanvasOpenAsset,
  continueInNeighborhood,
  model,
  kpiBadges,
  groupingOverview,
  grouping,
  selected,
  selectedEdge,
  search,
  selectEntity,
  handleFullGraphSelectEdge,
  setTab,
  setSearch,
  showNeighborhood,
  handleModelOverviewSelectRelationship,
  showAreaInCatalog,
  docsRef,
  walk,
  handleNeighborhoodGraphWalk,
  walkTo,
  handleNeighborhoodGraphSelectEntity,
  setSelectedEdge,
  handleNeighborhoodGraphOpenKpis,
  crossFile,
  crossTo,
  onStatus,
}: Props) {
  const looks = useMemo(() => groupLooks(groupingOverview), [groupingOverview]);
  // The Group menu sits in the graph's own tool row, beside Fit and the layout controls.
  const groupMenu = groupingOverview ? <GroupingControls overview={groupingOverview} value={grouping.value} onChange={grouping.change} error={grouping.error} /> : null;
  const groupColorOf = useCallback((id: string) => looks.get(id)?.color, [looks]);
  if (tab === 'fullgraph' && mappingId && mappingView === 'mapping') {
    return (
      <MappingCanvas
        key={mappingId}
        project={current?.project ?? ''}
        mappingId={mappingId}
        revisionKey={projectRevisionKey(docs, current?.project ?? '')}
        dirty={!!current && source !== current.source}
        fullscreen={fullscreen}
        toolbarExtra={graphViewSwitch}
        onEditItem={editMappingItem}
      />
    );
  }
  if (tab === 'fullgraph' && isContract && lineage && lineageCenterId) {
    // Lineage cards of the open contract's objects match its entities by object name.
    const objectLooks = new Map(
      (model?.entities ?? []).flatMap(e => {
        const look = looks.get(e.id);
        return look ? [[e.name, look] as const] : [];
      }),
    );
    const contractGroupOf = (card: LineageCard) => (card.kind === 'object' && card.file === current?.path ? objectLooks.get(card.label) : undefined);
    return (
      <LineageCanvas
        key={current?.id}
        graph={lineage}
        center={lineageCenterId}
        fullscreen={fullscreen}
        storageKey={current ? `workbench:lineage-steps:${current.id}` : undefined}
        onCenterChange={lineageCenterChanged}
        onOpenAsset={handleLineageCanvasOpenAsset}
        onNeighborhood={continueInNeighborhood}
        groupOf={contractGroupOf}
        toolbarExtra={groupMenu}
      />
    );
  }
  if (tab === 'fullgraph' && model) {
    return (
      <FullGraph
        toolbarExtra={graphViewSwitch}
        groupMenu={groupMenu}
        fullscreen={fullscreen}
        kpiBadges={kpiBadges}
        grouping={grouping.value}
        onGroupingChange={grouping.change}
        groupingError={grouping.error}
        key={current?.id}
        name={model.name}
        entities={model.entities}
        edges={model.edges}
        selected={selected}
        selectedEdge={selectedEdge}
        search={search}
        onSelectEntity={selectEntity}
        onSelectEdge={handleFullGraphSelectEdge}
      />
    );
  }
  if (tab === 'overview' && model) {
    return (
      <ModelOverview
        grouping={grouping.value}
        key={current?.id}
        name={model.name}
        entities={model.entities}
        edges={model.edges}
        search={search}
        selected={selected}
        onSelectEntity={selectEntity}
        onShowArea={showAreaInCatalog}
        onSelectRelationship={handleModelOverviewSelectRelationship}
        onClose={() => showNeighborhood()}
        onOpenGraph={() => {
          setTab('fullgraph');
        }}
      />
    );
  }
  return (
    <NeighborhoodGraph
      modelName={model?.name}
      fullscreen={fullscreen}
      kpiBadges={kpiBadges}
      groupColorOf={groupColorOf}
      key={current?.id}
      docId={current!.id}
      docLabel={id => docsRef.current.get(id)?.path ?? id}
      entities={model?.entities ?? []}
      edges={model?.edges ?? []}
      search={search}
      walk={walk}
      selected={selected}
      selectedEdge={selectedEdge}
      onWalk={handleNeighborhoodGraphWalk}
      onWalkTo={walkTo}
      onClearSearch={() => setSearch('')}
      onSelectEntity={handleNeighborhoodGraphSelectEntity}
      onSelectEdge={id => {
        setSelectedEdge(id);
      }}
      onOpenKpis={handleNeighborhoodGraphOpenKpis}
      crossFile={crossFile}
      onCrossFile={crossTo}
      onStatus={onStatus}
    />
  );
}
