/** Builds the neighborhood canvas nodes: column positions, chunked reveal of large additions and separation by measured size. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Position, useNodesState, type Node } from '@xyflow/react';
import type { Entity } from '../../shared/core/model';
import { canvasOf } from './expansion';
import type { Neighborhood, projectModel } from './graph-view';
import { placeLayers, placeNew, separateCards } from './incremental-layout';
import { neighborhoodLayout, NEIGHBOR_COLUMN, NEIGHBOR_ROW } from './layout';

// Large canvases (a pierce) render only what is on screen, so the main thread stays responsive.
export const NODE = { width: 250, height: 96 };
const REVEAL_CHUNK = 15;

function keepMeasuredSizes(previous: Node[], next: Node[]): Node[] {
  const measuredById = new Map(previous.map(node => [node.id, node.measured]));
  return next.map(node => {
    const measured = measuredById.get(node.id);
    return measured ? { ...node, measured } : node;
  });
}

type NodeInputs = {
  center: string | undefined;
  view: Neighborhood;
  canvasState: ReturnType<typeof canvasOf>;
  projection: ReturnType<typeof projectModel>;
  shownEntities: Entity[];
  membership: string;
};

export function useNeighborhoodNodes({ center, view, canvasState, projection, shownEntities, membership }: NodeInputs) {
  // Base positions from the column layout; each expansion places only its new nodes beside its
  // origin (incoming left, outgoing right; pierce by step distance), never moving placed ones.
  const positions = useMemo(() => {
    if (!center) return new Map<string, { x: number; y: number }>();
    let out = neighborhoodLayout(center, view.incoming, view.outgoing, view.both);
    for (const expansionSet of canvasState.active) {
      const grid = { column: NEIGHBOR_COLUMN, row: NEIGHBOR_ROW };
      if (expansionSet.kind === 'pierce')
        out = placeLayers(
          out,
          expansionSet.from,
          expansionSet.nodes.map(node => ({
            id: node,
            side: (expansionSet.direction === 'in' ? -1 : 1) as -1 | 1,
            step: Math.max(1, expansionSet.steps?.[node] ?? 1),
          })),
          grid,
        );
      else
        out = placeNew(
          out,
          expansionSet.from,
          expansionSet.nodes
            .filter(n => !out.has(n))
            .map(node => ({
              id: node,
              side: (projection.edges.some(e => e.source === expansionSet.from && e.target === node) ? 1 : -1) as -1 | 1,
            })),
          grid,
        );
    }
    return out;
  }, [membership]);
  // Nodes are derived from the view synchronously; selection and center styling never rebuild
  // them. A large addition (a pierce) is revealed in chunks, one per frame, so no frame blocks
  // input.
  const [reveal, setReveal] = useState(Infinity);
  const build = (limit = reveal) =>
    shownEntities.slice(0, limit).map((shownEntity): Node => ({
      id: shownEntity.id,
      position: positions.get(shownEntity.id) ?? { x: 0, y: 0 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: { width: NODE.width },
      data: { entity: shownEntity },
    }));
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(build());
  // A rebuilt node keeps the size React Flow measured, because the browser reports a size only
  // when it changes and a node left unmeasured would stay hidden.
  // Cards the user dragged since the nodes were last built; measurement-driven separation leaves them where they are.
  const draggedIds = useRef(new Set<string>());
  const rebuildNodes = (limit = reveal) => {
    draggedIds.current.clear();
    setNodes(previous => separateNodes(keepMeasuredSizes(previous, build(limit))));
  };
  const built = useRef(membership);
  useEffect(() => {
    if (built.current === membership) return;
    built.current = membership;
    const have = nodes.length;
    if (shownEntities.length - have <= REVEAL_CHUNK) {
      setReveal(Infinity);
      rebuildNodes(Infinity);
      return;
    }
    let revealedCount = have;
    let frame = 0;
    const tick = () => {
      revealedCount += REVEAL_CHUNK;
      const done = revealedCount >= shownEntities.length;
      setReveal(done ? Infinity : revealedCount);
      rebuildNodes(done ? Infinity : revealedCount);
      if (!done) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [membership]);
  // Cards grow when their description wraps, so once every card is measured they are moved apart
  // using their real heights.
  const heightKey = useMemo(() => nodes.map(node => `${node.id}:${node.measured?.height ?? ''}`).join('|'), [nodes]);
  const [separatedKey, setSeparatedKey] = useState('');
  // Earlier cards are placed first: the center's own view, then each expansion in the order it was made.
  const placementRank = useMemo(() => {
    const rank = new Map<string, number>();
    for (const id of view.entities.map(e => e.id)) rank.set(id, 0);
    canvasState.active.forEach((expansionSet, index) => {
      for (const id of [expansionSet.from, ...expansionSet.nodes]) if (!rank.has(id)) rank.set(id, index + 1);
    });
    return rank;
  }, [view, canvasState]);
  // Positions always start from the column layout, so the same cards give the same placement and
  // Back, Forward and Undo restore a canvas exactly.
  // Dragged cards start from where the user left them and are placed first, so they do not move.
  const separateNodes = (toSeparate: Node[]): Node[] => {
    const dragged = draggedIds.current;
    const startById = new Map(toSeparate.map(node => [node.id, dragged.has(node.id) ? node.position : (positions.get(node.id) ?? node.position)]));
    const rankWithDragged = new Map(placementRank);
    for (const id of dragged) rankWithDragged.set(id, -1);
    const sizeById = new Map(toSeparate.map(node => [node.id, { width: node.measured?.width ?? NODE.width, height: node.measured?.height ?? NODE.height }]));
    const centerSize = sizeById.get(center ?? '');
    const centerTop = startById.get(center ?? '')?.y ?? 0;
    const separated = separateCards(startById, sizeById, centerTop + (centerSize?.height ?? NODE.height) / 2, rankWithDragged);
    return toSeparate.map(node => ({ ...node, position: separated.get(node.id) ?? node.position }));
  };
  const separateMeasured = () => {
    setNodes(previous => separateNodes(previous));
    setSeparatedKey(heightKey);
  };
  useEffect(() => {
    const allMeasured = nodes.length > 0 && nodes.every(node => node.measured?.height);
    if (allMeasured && separatedKey !== heightKey) separateMeasured();
  }, [heightKey, separatedKey]);
  return { nodes, onNodesChange, draggedIds, rebuildNodes, separatedKey, setSeparatedKey, heightKey };
}
