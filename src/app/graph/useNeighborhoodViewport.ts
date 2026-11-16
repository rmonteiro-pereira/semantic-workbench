/** Owns first-view, expansion and resize viewports for the neighborhood canvas. */
import { useEffect, useRef, useState } from 'react';
import { useReactFlow, type Node } from '@xyflow/react';
import { DETAIL_ZOOM } from './FarZoom';
import { useViewRestore, type Fullscreen } from './fullscreen';
import { expansionViewport } from './expansion-viewport';
import { NEIGHBOR_COLUMN } from './layout';
import type { canvasOf, ExpansionSet } from './expansion';
import type { assignRoutes, Box } from './RelationshipEdge';

type Inputs = {
  nodes: Node[];
  center: string | undefined;
  boxes: Map<string, Box>;
  routes: ReturnType<typeof assignRoutes>;
  separatedKey: string;
  heightKey: string;
  membership: string;
  sets: ExpansionSet[];
  canvasState: ReturnType<typeof canvasOf>;
  fullscreen?: Fullscreen;
};

/** Keeps viewport publication synchronized with measured node membership. */
export function useNeighborhoodViewport({ nodes, center, boxes, routes, separatedKey, heightKey, membership, sets, canvasState, fullscreen }: Inputs) {
  // Fit once the nodes of a new membership are measured; refit when the canvas is resized.
  const canvas = useRef<HTMLDivElement>(null);
  const { getViewport, setViewport, zoomIn, zoomOut } = useReactFlow();
  const [fitted, setFitted] = useState('');
  const held = useViewRestore(
    !!fullscreen?.active,
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
    const pane = canvas.current;
    if (!pane) return;
    const viewport = expansionViewport({ x: cx - halfW, y: cy - halfH, width: 2 * halfW, height: 2 * halfH }, { x: cx, y: cy }, { width: pane.clientWidth, height: pane.clientHeight }, 0.8, 1);
    void setViewport(viewport, { duration: 0 });
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
  return { canvas, measured, fitted, setFitted, fitRef, zoomIn, zoomOut };
}
