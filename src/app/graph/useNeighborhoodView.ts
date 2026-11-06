/** Decides what the neighborhood canvas shows: the filtered model, the walk's centre, its neighbors and the expansions on it. */
import { useMemo } from 'react';
import type { Entity, Relationship } from '../../shared/core/model';
import { VALUE_KINDS } from './hidden-kinds';
import { canvasAt, type Walk } from './walk';
import { canvasOf, setsOf } from './expansion';
import { groupRelationships, neighborhood, projectModel } from './graph-view';

const LATERAL_DEFAULT_MAX = 10;

type ViewInputs = {
  docId: string;
  all: Entity[];
  allEdges: Relationship[];
  walk: Walk;
  hideKpis: boolean;
  hideValues: boolean;
  technical: boolean;
  limit: number;
  relationship: string;
  lateralChoice: boolean | null;
};

export function useNeighborhoodView({ docId, all, allEdges, walk, hideKpis, hideValues, technical, limit, relationship, lateralChoice }: ViewInputs) {
  const entities = useMemo(() => all.filter(e => !(hideKpis && e.kind === 'Metric') && !(hideValues && VALUE_KINDS.has(e.kind))), [all, hideKpis, hideValues]);
  const edges = useMemo(() => {
    if (!hideKpis && !hideValues) return allEdges;
    const ids = new Set(entities.map(e => e.id));
    return allEdges.filter(e => ids.has(e.source) && ids.has(e.target));
  }, [allEdges, entities, hideKpis, hideValues]);
  // The canvas at this point of the walk: its re-centring step and the expansions after it.
  const walkCanvas = useMemo(() => canvasAt(walk), [walk]);
  const step = walkCanvas.center;
  const requested = step?.doc === docId ? step.center : undefined;
  const stepIndex = step ? walk.steps.lastIndexOf(step) : -1;
  const before = stepIndex > 0 ? walk.steps[stepIndex - 1] : undefined;
  const previous = before && before.doc === docId ? before.center : undefined;
  // Links among neighbors are shown by default unless there are so many that they bury the
  // center's own relationships; the toggle states how many there are either way.
  const base = useMemo(
    () =>
      neighborhood(entities, edges, {
        center: requested,
        limit,
        lateral: false,
        technical,
        relationship: relationship || undefined,
        keep: previous ? [previous] : [],
      }),
    [entities, edges, requested, limit, technical, relationship, previous],
  );
  const lateralCount = base.lateral;
  const lateral = lateralChoice ?? lateralCount <= LATERAL_DEFAULT_MAX;
  const view = useMemo(
    () =>
      lateral
        ? neighborhood(entities, edges, {
            center: requested,
            limit,
            lateral,
            technical,
            relationship: relationship || undefined,
            keep: previous ? [previous] : [],
          })
        : base,
    [base, lateral],
  );
  const center = view.center;
  const byId = useMemo(() => new Map(all.map(e => [e.id, e])), [all]);
  // Expansions in place on top of the centre's view; a walk to another centre starts afresh.
  const projection = useMemo(() => projectModel(entities, edges, technical), [entities, edges, technical]);
  const sets = useMemo(() => (step && step.doc === docId && step.center === center ? setsOf(walkCanvas.sets) : []), [walkCanvas, step, docId, center]);
  const canvasState = useMemo(
    () =>
      canvasOf(
        view.entities.map(e => e.id),
        sets,
      ),
    [view, sets],
  );
  const shownEntities = useMemo(() => {
    const ids = new Set(canvasState.nodes);
    const extra = canvasState.nodes
      .filter(id => !view.entities.some(e => e.id === id))
      .map(id => byId.get(id))
      .filter((e): e is Entity => !!e);
    return [...view.entities, ...extra].filter(e => ids.has(e.id));
  }, [canvasState, view, byId]);
  const shownEdges = useMemo(() => {
    if (!sets.length) return view.edges;
    const ids = new Set(canvasState.nodes);
    const own = new Set(canvasState.active.flatMap(s => s.edges));
    const base = new Set(view.edges.map(e => e.id));
    return [
      ...view.edges,
      ...projection.edges.filter(
        edge => !base.has(edge.id) && ids.has(edge.source) && ids.has(edge.target) && (own.has(edge.id) || (lateral && canvasState.active.some(s => s.from === edge.source || s.from === edge.target))),
      ),
    ];
  }, [sets, view, canvasState, projection, lateral]);
  const pierceSet = canvasState.active.filter(s => s.kind === 'pierce').at(-1);
  const groups = useMemo(() => groupRelationships(shownEdges), [shownEdges]);
  const membership = JSON.stringify([center, shownEntities.map(e => e.id)]);
  return { entities, edges, step, previous, lateralCount, lateral, view, center, byId, projection, sets, canvasState, shownEntities, shownEdges, pierceSet, groups, membership };
}
