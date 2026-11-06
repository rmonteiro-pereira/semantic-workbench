/** Displays a centered relationship graph with expansion and navigation history. */
import { VALUE_KINDS, readHideValues, writeHideValues } from './hidden-kinds';
import { DETAIL_ZOOM, LOWEST_FIT_ZOOM, useFarZoom } from './FarZoom';
import { EntityName } from './EntityName';
import { useActionHistory } from '../workspace/ActionHistoryContext';
import { useRecordedState } from '../workspace/hooks/useRecordedState';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, MarkerType, useReactFlow } from '@xyflow/react';
import { ArrowRight, Crosshair, Gauge, Minus, Plus } from 'lucide-react';
import { allConnectedLabel, getSet, neighbours, registerSet, sameExpansion, type Direction, type ExpansionSet } from './expansion';
import { expansionViewport } from './expansion-viewport';
import { PIERCE_BUDGET, PIERCE_MAX } from './pierce';
import { PierceBanner, usePierce } from './PierceControls';
import { useCompactToolbar } from './CompactControls';
import type { Entity, Relationship } from '../../shared/core/model';
import { edgeEndCounts, kindWords, searchEntities, projectModel, NEIGHBOR_PAGE } from './graph-view';
import { NEIGHBOR_COLUMN } from './layout';
import { assignRoutes, heightForEdgeEnds, placeLabels, routePoints, relationshipEdgeTypes, type Box } from './RelationshipEdge';
import type { Walk, WalkStep } from './walk';
import { useViewRestore, type Fullscreen } from './fullscreen';
import { NeighborhoodLinks, NeighborhoodTools } from './NeighborhoodToolbar';
import { NODE, useNeighborhoodNodes } from './useNeighborhoodNodes';
import { useNeighborhoodView } from './useNeighborhoodView';
// Incoming neighbors appear left of the center and outgoing neighbors right. Navigation history
// also records steps into other project files.
/** Identifies a navigation target in another project document. */
export type CrossFileTarget = {
  doc: string;
  file: string;
  entity: string;
  name: string;
  reason: string;
};
/** Supplies the model, selection and callbacks for neighborhood navigation. */
export type NeighborhoodGraphProps = {
  docId: string;
  docLabel: (doc: string) => string;
  entities: Entity[];
  edges: Relationship[];
  search: string;
  walk: Walk;
  selected: string;
  selectedEdge: string;
  onWalk: (steps: WalkStep[]) => void;
  onWalkTo: (index: number) => void;
  onClearSearch: () => void;
  onSelectEntity: (id: string) => void;
  onSelectEdge: (id: string) => void;
  modelName?: string;
  kpiBadges?: Map<string, string[]>;
  /** The colour of an entity's group under the current Group by choice. */
  groupColorOf?: (entityId: string) => string | undefined;
  fullscreen?: Fullscreen;
  onOpenKpis?: (concept: string) => void;
  crossFile?: (entity: Entity) => CrossFileTarget[];
  onCrossFile?: (target: CrossFileTarget) => void;
};
/** Displays the current graph center and its expandable neighborhood. */
export function NeighborhoodGraph(props: NeighborhoodGraphProps) {
  return (
    <ReactFlowProvider>
      <NeighborhoodCanvas {...props} />
    </ReactFlowProvider>
  );
}
// Large canvases (a pierce) render only what is on screen, so the main thread stays responsive.
const LARGE_CANVAS = 60;
const COLORS = {
  out: 'var(--color-edge-out)',
  in: 'var(--color-edge-in)',
  lateral: 'var(--color-edge-lateral)',
};
function NeighborhoodCanvas(props: NeighborhoodGraphProps) {
  const { docId, entities: all, edges: allEdges, search, walk, selected, selectedEdge, kpiBadges, groupColorOf } = props;
  const trail = useRef<HTMLOListElement>(null);
  const actionHistory = useActionHistory();
  const [hideKpis, setHideKpis] = useRecordedState('neighborhood.hideKpis', false);
  const [lateralChoice, setLateral] = useRecordedState<boolean | null>('neighborhood.lateral', null);
  const [technical, setTechnical] = useRecordedState('neighborhood.technical', false);
  const [labels, setLabels] = useRecordedState('neighborhood.labels', false);
  const [hovered, setHovered] = useState('');
  const compact = useCompactToolbar();
  const [limit, setLimit] = useRecordedState('neighborhood.limit', NEIGHBOR_PAGE);
  const [relationship, setRelationship] = useRecordedState('neighborhood.relationship', '');
  const kpiCount = useMemo(() => all.filter(e => e.kind === 'Metric').length, [all]);
  const [hideValues, setHideValues] = useRecordedState('neighborhood.hideValues', () => readHideValues(props.modelName));
  const valueCount = useMemo(() => all.filter(e => VALUE_KINDS.has(e.kind)).length, [all]);
  const { entities, edges, step, previous, lateralCount, lateral, view, center, byId, projection, sets, canvasState, shownEntities, pierceSet, groups, membership } = useNeighborhoodView({
    docId,
    all,
    allEdges,
    walk,
    hideKpis,
    hideValues,
    technical,
    limit,
    relationship,
    lateralChoice,
  });
  useEffect(() => {
    const list = trail.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!list || !current) return;
    const frame = list.getBoundingClientRect();
    const button = current.getBoundingClientRect();
    const clearance = 4;
    if (button.left < frame.left + clearance) list.scrollLeft -= frame.left + clearance - button.left;
    else if (button.right > frame.right - clearance) list.scrollLeft += button.right - frame.right + clearance;
  }, [walk, center, docId]);
  // Paging and the relationship filter belong to one center.
  useEffect(() => {
    setLimit(NEIGHBOR_PAGE);
    setRelationship('');
  }, [center]);
  const { nodes, onNodesChange, draggedIds, rebuildNodes, separatedKey, setSeparatedKey, heightKey } = useNeighborhoodNodes({ center, view, canvasState, projection, shownEntities, membership });
  const boxes = useMemo(
    () =>
      new Map<string, Box>(
        nodes.map(node => [
          node.id,
          {
            x: node.position.x,
            y: node.position.y,
            width: node.measured?.width ?? NODE.width,
            height: node.measured?.height ?? NODE.height,
          },
        ]),
      ),
    [nodes],
  );
  const routes = useMemo(
    () =>
      assignRoutes(
        groups.map(g => ({ id: g.id, source: g.source, target: g.target })),
        boxes,
      ),
    [groups, boxes],
  );
  const walkTo = (target: string, via?: { id: string; label: string }, select = true) => {
    if (!center || target === center) return;
    const entity = byId.get(target);
    if (!entity) return;
    const steps: WalkStep[] = [];
    if (!step || step.doc !== docId || step.center !== center) steps.push({ doc: docId, center, name: byId.get(center)?.name ?? center });
    steps.push({ doc: docId, center: target, name: entity.name, ...(via ? { via } : {}) });
    props.onWalk(steps);
    if (select) props.onSelectEntity(target);
  };
  // Expand / Collapse / Full pierce record steps on the walk ("expanded X"), so Back and Undo
  // expansion restore the earlier canvas exactly.
  const nameOf = (id: string) => byId.get(id)?.name ?? id;
  const record = (set: ExpansionSet, label: string) => {
    if (!center) return;
    const steps: WalkStep[] = [];
    if (!step || step.doc !== docId || step.center !== center) steps.push({ doc: docId, center, name: nameOf(center) });
    steps.push({ doc: docId, center, name: label, kind: 'expand', set: set.id });
    props.onWalk(steps);
  };
  const expand = (id: string) => {
    const neighbourSet = neighbours(projection.edges, id, 'both', nameOf);
    record(
      registerSet({
        kind: 'expand',
        from: id,
        direction: 'both',
        nodes: neighbourSet.nodes,
        edges: neighbourSet.edges,
        frontier: {},
        total: neighbourSet.nodes.length,
        budget: neighbourSet.nodes.length,
      }),
      `expanded ${nameOf(id)}`,
    );
  };
  const collapse = (id: string) => {
    const target = canvasState.expandedBy.get(id);
    if (target)
      record(
        registerSet({
          kind: 'collapse',
          from: id,
          target,
          direction: 'both',
          nodes: [],
          edges: [],
          frontier: {},
          total: 0,
          budget: 0,
        }),
        `collapsed ${nameOf(id)}`,
      );
  };
  const [direction, setDirection] = useRecordedState<Direction>('neighborhood.direction', 'out');
  const pierce = usePierce();
  // The pierce result arrives later, so it reads the walk and canvas as they are then.
  const currentTrail = useRef({ walk, canvasNodes: canvasState.nodes });
  currentTrail.current = { walk, canvasNodes: canvasState.nodes };
  const fullPierce = async (budget = PIERCE_BUDGET) => {
    const from = selected && canvasState.nodes.includes(selected) ? selected : center;
    if (!from) return;
    const pierceResult = await pierce.run(
      projection.entities.map(e => ({ id: e.id, name: e.name, kind: e.kind })),
      projection.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
      })),
      [from],
      { direction, valueTypes: !hideValues, technical, metrics: !hideKpis, budget },
    );
    if (!pierceResult) return;
    const pierceRequest: Omit<ExpansionSet, 'id'> = {
      kind: 'pierce',
      from,
      direction,
      nodes: pierceResult.nodes.filter(n => n !== from),
      edges: pierceResult.edges,
      frontier: pierceResult.frontier,
      total: pierceResult.total,
      budget,
      steps: pierceResult.steps,
    };
    // Repeating a request that is already on the trail goes back to that step instead of adding another.
    const { walk: currentWalk, canvasNodes } = currentTrail.current;
    const repeatedIndex = currentWalk.steps.findIndex(walkStep => {
      const earlier = walkStep.set ? getSet(walkStep.set) : undefined;
      return !!earlier && sameExpansion(earlier, pierceRequest);
    });
    if (repeatedIndex >= 0) {
      props.onWalkTo(repeatedIndex);
      return;
    }
    const shownNodes = new Set(canvasNodes);
    if (pierceRequest.nodes.every(node => shownNodes.has(node))) return;
    // The result arrives after the click that asked for it, so it opens its own history step.
    actionHistory.act('pierce', () => record(registerSet(pierceRequest), allConnectedLabel(nameOf(from))));
  };
  const undoable = walk.steps[walk.index]?.kind === 'expand';
  const pierceOrigin = selected && canvasState.nodes.includes(selected) ? nameOf(selected) : 'the center';
  // A new centre or document stops a running pierce .
  useEffect(() => () => pierce.stop(), [center, docId]);
  const viaFor = (target: string) => {
    const relationship = view.edges.find(x => (x.source === center && x.target === target) || (x.target === center && x.source === target));
    return relationship ? { id: relationship.id, label: relationship.label } : undefined;
  };
  // A card with many edges on one side is tall enough to give each edge end its own spot.
  const minHeights = useMemo(() => {
    const heights = new Map<string, number>();
    for (const [id, count] of edgeEndCounts(groups)) heights.set(id, heightForEdgeEnds(count));
    return heights;
  }, [groups]);
  const rendered = useMemo(
    () =>
      nodes.map(node => {
        const entity = node.data.entity as Entity;
        const kpis = kpiBadges?.get(entity.name) ?? [];
        const isCenter = node.id === center;
        const groupColor = groupColorOf?.(entity.id);
        let centerTag: React.ReactNode;
        if (isCenter) {
          centerTag = (
            <span className="center-tag">
              <Crosshair size={10} />
              Center
            </span>
          );
        } else if (node.id === previous) {
          centerTag = <span className="origin-tag">Previous center</span>;
        } else {
          centerTag = null;
        }
        return {
          ...node,
          style: { ...node.style, minHeight: minHeights.get(entity.id), ...(groupColor ? { '--group-color': groupColor } : {}) } as React.CSSProperties,
          className: ['neighborhood-node', isCenter ? ' center' : '', node.id === previous ? ' origin' : '', node.id === selected ? ' selected-entity' : ''].join(''),
          data: {
            ...node.data,
            label: (
              <div className={`node${entity.kind === 'Metric' ? ' kpi-node' : ''}`}>
                <small>
                  {centerTag}
                  {entity.kind === 'Metric' ? (
                    <>
                      <Gauge size={10} /> Metric
                    </>
                  ) : (
                    kindWords(entity.kind)
                  )}
                </small>
                <EntityName name={entity.name} />
                <span title={entity.description || undefined}>
                  {entity.fields.length ? `${entity.fields.length} ${entity.fields.length === 1 ? 'field' : 'fields'}` : entity.description || 'Select to inspect'}
                </span>
                <div className="node-actions">
                  {!isCenter &&
                    (canvasState.expandedBy.has(entity.id) ? (
                      <button
                        className="expand-button nodrag"
                        aria-label={`Collapse ${entity.name}`}
                        title="Remove what expanding this added"
                        onClick={ev => {
                          ev.stopPropagation();
                          collapse(entity.id);
                        }}
                      >
                        <Minus size={12} />
                      </button>
                    ) : (
                      <button
                        className="expand-button nodrag"
                        aria-label={`Expand ${entity.name}`}
                        title="Add its neighbours here"
                        onClick={ev => {
                          ev.stopPropagation();
                          expand(entity.id);
                        }}
                      >
                        <Plus size={12} />
                      </button>
                    ))}
                  {pierceSet?.frontier[entity.id] ? (
                    <span className="frontier-marker" title="Reachable but not shown">
                      +{pierceSet.frontier[entity.id]} hidden
                    </span>
                  ) : null}
                  {!isCenter && (
                    <button
                      className="walk-button nodrag"
                      aria-label={`Walk to ${entity.name}`}
                      onClick={ev => {
                        ev.stopPropagation();
                        walkTo(entity.id, viaFor(entity.id));
                      }}
                    >
                      <ArrowRight size={12} />
                      Walk here
                    </button>
                  )}
                  {kpis.length > 0 && (
                    <button
                      className="kpi-badge nodrag"
                      title={`Metrics: ${kpis.join(', ')}`}
                      aria-label={`Open ${kpis.length} metric${kpis.length === 1 ? '' : 's'} for ${entity.name}`}
                      onClick={ev => {
                        ev.stopPropagation();
                        props.onOpenKpis?.(entity.name);
                      }}
                    >
                      <Gauge size={10} />
                      {kpis.length === 1 ? 'Metric' : `${kpis.length} metrics`}
                    </button>
                  )}
                </div>
              </div>
            ),
          },
        };
      }),
    [nodes, center, previous, selected, kpiBadges, groupColorOf, view, canvasState, pierceSet, minHeights],
  );
  // Relationship labels grow as the canvas zooms out so they stay readable; the cards do not
  // change with zoom.
  const zoomWatch = useFarZoom();
  const labelScale = zoomWatch.labelScale;
  const labelText = (g: (typeof groups)[number]) => (g.data.relationships.length > 1 ? `${g.data.relationships.length} relationships` : g.label);
  const shownLabels = groups.filter(g => labels || hovered === g.id || g.data.relationships.some(r => r.id === selectedEdge));
  const labelAt = useMemo(
    () =>
      placeLabels(
        shownLabels.flatMap(shownLabel => {
          const sourceBox = boxes.get(shownLabel.source);
          const targetBox = boxes.get(shownLabel.target);
          const edgeRoute = routes.get(shownLabel.id);
          if (!sourceBox || !targetBox || !edgeRoute) return [];
          return [
            {
              id: shownLabel.id,
              text: String(labelText(shownLabel)),
              points: routePoints({ x: sourceBox.x + sourceBox.width, y: sourceBox.y + sourceBox.height / 2 }, { x: targetBox.x, y: targetBox.y + targetBox.height / 2 }, edgeRoute).points,
            },
          ];
        }),
        [...boxes.values()],
        labelScale,
      ),
    [shownLabels.map(g => g.id).join('|'), routes, boxes, labelScale],
  );
  const renderedIds = new Set(nodes.map(n => n.id));
  const visibleEdges = groups
    .filter(g => renderedIds.has(g.source) && renderedIds.has(g.target))
    .map(edgeGroup => {
      const active = edgeGroup.data.relationships.some(r => r.id === selectedEdge);
      let kind: 'out' | 'in' | 'lateral';
      if (edgeGroup.source === center && edgeGroup.target !== center) {
        kind = 'out';
      } else if (edgeGroup.target === center && edgeGroup.source !== center) {
        kind = 'in';
      } else if (edgeGroup.source === center) {
        kind = 'out';
      } else {
        kind = 'lateral';
      }
      const color = COLORS[kind as keyof typeof COLORS];
      let strokeWidth: number;
      if (active) {
        strokeWidth = 2.6;
      } else if (kind === 'lateral') {
        strokeWidth = 1.1;
      } else {
        strokeWidth = 1.5;
      }
      return {
        ...edgeGroup,
        type: 'relationship',
        data: {
          ...edgeGroup.data,
          route: routes.get(edgeGroup.id),
          direction: kind,
          labelAt: labelAt.get(edgeGroup.id),
          labelScale,
        },
        label: labels || active || hovered === edgeGroup.id ? labelText(edgeGroup) : undefined,
        selected: active,
        interactionWidth: 24,
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        className: `edge-${kind}`,
        style: {
          stroke: color,
          strokeOpacity: kind === 'lateral' ? 0.55 : 0.85,
          strokeWidth,
          strokeDasharray: kind === 'lateral' ? '5 4' : undefined,
        },
      };
    });
  // Fit once the nodes of a new membership are measured; refit when the canvas is resized.
  const canvas = useRef<HTMLDivElement>(null);
  const { fitBounds, getViewport, setViewport, setCenter, zoomIn, zoomOut } = useReactFlow();
  const [fitted, setFitted] = useState('');
  const held = useViewRestore(
    !!props.fullscreen?.active,
    () => getViewport(),
    v => {
      void setViewport(v);
    },
  );
  const measured = nodes.length > 0 && separatedKey === heightKey && nodes.every(n => n.measured?.width) && JSON.stringify([center, nodes.map(n => n.id)]) === membership;
  // The fitted area is symmetric around the center node, so the center sits in the middle of the
  // canvas even when one side has more columns; it leaves room for the lanes above and below.
  const fitRef = useRef(() => {});
  fitRef.current = () => {
    const box = boxes.get(center ?? '');
    if (!box || !boxes.size) return;
    const all = [...boxes.values()];
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const halfW = Math.max(...all.map(b => Math.max(cx - b.x, b.x + b.width - cx)));
    const lanes = [...routes.values()].filter(r => r.route === 'lane' || r.route === 'loop').length;
    const halfH = Math.max(...all.map(b => Math.max(cy - b.y, b.y + b.height - cy))) + Math.min(160, 30 + lanes * 16);
    void fitBounds({ x: cx - halfW, y: cy - halfH, width: 2 * halfW, height: 2 * halfH }, { padding: 0.06, duration: 0 }).then(() => {
      // A canvas too wide for the pane opens on the centre at a zoom where names still read.
      if (getViewport().zoom < LOWEST_FIT_ZOOM) {
        void setCenter(cx, cy, { zoom: LOWEST_FIT_ZOOM, duration: 0 });
      }
    });
  };
  // After an expansion or pierce, show what it added around its origin at the unscaled card size;
  // the zoom-out controls and Re-center show the whole canvas.
  const READABLE = DETAIL_ZOOM;
  const focusLatest = () => {
    const expansionSet = canvasState.active.at(-1);
    if (!expansionSet) {
      fitRef.current();
      return false;
    }
    const ids = [expansionSet.from, ...expansionSet.nodes].filter(id => boxes.has(id));
    const bs = ids.map(id => boxes.get(id)!);
    if (!bs.length) {
      fitRef.current();
      return false;
    }
    const x0 = Math.min(...bs.map(b => b.x));
    const y0 = Math.min(...bs.map(b => b.y));
    const x1 = Math.max(...bs.map(b => b.x + b.width));
    const y1 = Math.max(...bs.map(b => b.y + b.height));
    const origin = boxes.get(expansionSet.from)!;
    const pane = canvas.current;
    if (!pane) return false;
    const originShift = expansionSet.kind === 'pierce' && expansionSet.direction !== 'in' ? NEIGHBOR_COLUMN * 0.9 : 0;
    const viewport = expansionViewport(
      { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
      { x: origin.x + origin.width / 2 + originShift, y: origin.y + origin.height / 2 },
      { width: pane.clientWidth, height: pane.clientHeight },
      READABLE,
    );
    void setViewport(viewport, { duration: 0 });
    return true;
  };
  useEffect(() => {
    if (!measured || fitted === membership) return;
    const frame = requestAnimationFrame(() => {
      if (sets.length) focusLatest();
      else fitRef.current();
      setFitted(membership);
    });
    return () => cancelAnimationFrame(frame);
  }, [measured, membership, fitted]);
  // A resize (the pierce banner appearing, the window) keeps the same rule.
  const resizeFit = useRef(() => {});
  resizeFit.current = () => {
    if (sets.length) focusLatest();
    else fitRef.current();
  };
  useEffect(() => {
    if (!canvas.current) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!held()) resizeFit.current();
      });
    });
    observer.observe(canvas.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  // Center picker (searchable; exact matches first) and toolbar search results.
  const projected = useMemo(() => projectModel(entities, edges, technical).entities, [entities, edges, technical]);
  const [pick, setPick] = useState('');
  const [pickOpen, setPickOpen] = useState(false);
  const [active, setActive] = useState(0);
  const pickResults = useMemo(() => (pick.trim() ? searchEntities(projected, pick, 30) : []), [projected, pick]);
  const searchResults = useMemo(() => (search.trim() ? searchEntities(projected, search, 30) : []), [projected, search]);
  const choose = (id: string) => {
    const entity = byId.get(id);
    if (!entity) return;
    props.onWalk([{ doc: docId, center: id, name: entity.name }]);
    props.onSelectEntity(id);
    setPick('');
    setPickOpen(false);
    props.onClearSearch();
  };
  const centerEntity = center ? byId.get(center) : undefined;
  // The current center is on the trail unless it was reached without a step (default center, new
  // file).
  const offTrail = !step || step.doc !== docId || step.center !== center;
  const cross = centerEntity && props.crossFile ? props.crossFile(centerEntity) : [];
  const kpiFor = centerEntity ? (kpiBadges?.get(centerEntity.name) ?? []) : [];
  // The counts and paging sit in the toolbar, or in the row below it on a phone, where the
  // toolbar keeps only the centre picker and the Controls button.
  useEffect(() => writeHideValues(props.modelName, hideValues), [props.modelName, hideValues]);
  const toggleValueTypes = () => setHideValues(hidden => !hidden);
  // Dragged nodes go back to their columns; the center stays the same.
  const rearrange = () => {
    setSeparatedKey('');
    rebuildNodes();
    setFitted('');
  };
  return (
    <div className="neighborhood-graph">
      <NeighborhoodTools
        picker={{ centerEntity, pick, setPick, pickOpen, setPickOpen, active, setActive, pickResults, onChoose: choose }}
        counts={{ centerEntity, view, limit, setLimit }}
        compact={compact}
        direction={direction}
        onDirection={setDirection}
        pierceRunning={pierce.running}
        onPierce={() => void fullPierce()}
        onStopPierce={pierce.stop}
        canUndo={undoable}
        onUndo={actionHistory.back}
        pierceOrigin={pierceOrigin}
        onZoomIn={() => void zoomIn({ duration: 150 })}
        onZoomOut={() => void zoomOut({ duration: 150 })}
        options={{
          view,
          relationship,
          setRelationship,
          lateral,
          lateralCount,
          onLateral: setLateral,
          technical,
          setTechnical,
          labels,
          setLabels,
          valueCount,
          hideValues,
          onToggleValueTypes: toggleValueTypes,
          kpiCount,
          hideKpis,
          setHideKpis,
          onRearrange: rearrange,
        }}
        fullscreen={props.fullscreen}
      />
      <NeighborhoodLinks
        compact={compact}
        counts={{ centerEntity, view, limit, setLimit }}
        actionHistory={actionHistory}
        trail={trail}
        walk={walk}
        docId={docId}
        docLabel={props.docLabel}
        offTrail={offTrail}
        centerEntity={centerEntity}
        onWalkTo={props.onWalkTo}
        cross={cross}
        onCrossFile={props.onCrossFile}
        kpiFor={kpiFor}
        onOpenKpis={props.onOpenKpis}
      />
      {pierceSet && walk.steps[walk.index]?.set === pierceSet.id && (
        <PierceBanner
          result={{
            shown: pierceSet.nodes.length + 1,
            total: pierceSet.total,
            maxStep: Math.max(0, ...Object.values(pierceSet.steps ?? {})),
          }}
          budget={pierceSet.budget}
          max={PIERCE_MAX}
          running={pierce.running}
          onStop={pierce.stop}
          onFurther={() => void fullPierce(Math.min(PIERCE_MAX, pierceSet.budget + PIERCE_BUDGET))}
        />
      )}
      <div
        className="neighborhood-canvas"
        ref={canvas}
        data-viewport-ready={measured && fitted === membership}
        data-canvas-nodes={canvasState.nodes.length}
        data-canvas-ids={canvasState.nodes.join(' ')}
      >
        {search.trim() && (
          <div className="neighborhood-search" role="region" aria-label="Search results">
            {searchResults.length ? (
              <>
                <small>Choose a center</small>
                <ul role="listbox" aria-label="Matching entities">
                  {searchResults.map(searchResult => (
                    <li key={searchResult.id} role="option" aria-selected={false}>
                      <button onClick={() => choose(searchResult.id)}>
                        <EntityName name={searchResult.name} />
                        <small>{searchResult.kind}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>No entity matches “{search}”.</p>
            )}
          </div>
        )}
        {!view.entities.length ? (
          <div className="graph-empty" role="status">
            This model has no entities to display.
          </div>
        ) : (
          <ReactFlow
            nodes={rendered}
            edges={visibleEdges}
            edgeTypes={relationshipEdgeTypes}
            minZoom={0.05}
            maxZoom={2}
            nodesConnectable={false}
            onNodesChange={onNodesChange}
            onNodeDragStop={(_, node) => draggedIds.current.add(node.id)}
            onlyRenderVisibleElements={rendered.length > LARGE_CANVAS}
            onNodeClick={(_, node) => {
              if (node.id === center) props.onSelectEntity(node.id);
              else walkTo(node.id, viaFor(node.id));
            }}
            onEdgeClick={(_, edge) => {
              // A relationship line expands its far end in place; Walk here re-centres.
              let ends: string[];
              if (edge.source === center) {
                ends = [edge.target];
              } else if (edge.target === center) {
                ends = [edge.source];
              } else {
                ends = [edge.target, edge.source];
              }
              const far = ends.find(id => !canvasState.expandedBy.has(id));
              if (far) expand(far);
              props.onSelectEdge(edge.id);
            }}
            onEdgeMouseEnter={(_, edge) => setHovered(edge.id)}
            onEdgeMouseLeave={() => setHovered('')}
          >
            <Background gap={22} size={1} />
            {zoomWatch.watcher}
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
