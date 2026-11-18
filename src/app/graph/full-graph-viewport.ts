/** Fits whole-model nodes using their compound positions and measured card dimensions. */
import { getViewportForBounds, type ReactFlowInstance } from '@xyflow/react';
import { NAME_MIN_PX, MODEL_CARD_WIDTH } from './overview-capacity';

/** Fits all current nodes, retaining the current viewport when the pane is hidden. */
export function fitFullGraph(instance: ReactFlowInstance<any, any> | null, canvas: Element | null | undefined, duration: number, reservedWidth = 0) {
  if (!instance || !canvas) return;
  const current = instance.getNodes();
  const byId = new Map(current.map(n => [n.id, n]));
  if (!current.length) return;
  const boxes = current.map(node => {
    let x = node.position.x;
    let y = node.position.y;
    let parent = node.parentId;
    const seen = new Set<string>();
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      const parentNode = byId.get(parent);
      if (!parentNode) break;
      x += parentNode.position.x;
      y += parentNode.position.y;
      parent = parentNode.parentId;
    }
    return {
      x,
      y,
      width: Number(node.style?.width ?? node.measured?.width ?? MODEL_CARD_WIDTH),
      height: Number(node.style?.height ?? node.measured?.height ?? 60),
    };
  });
  const x = Math.min(...boxes.map(n => n.x));
  const y = Math.min(...boxes.map(n => n.y));
  const width = Math.max(...boxes.map(n => n.x + n.width)) - x;
  const height = Math.max(...boxes.map(n => n.y + n.height)) - y;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const startsValid = Number.isFinite(instance.getViewport().zoom);
  const viewport = getViewportForBounds({ x, y, width, height }, Math.max(1, rect.width - reservedWidth), rect.height, 0.001, 1, 0.08);
  void instance.setViewport(viewport, { duration: startsValid ? duration : 0 });
  return viewport.zoom;
}

/** Frames neighbors when readable, otherwise keeps the selected entity at the pane center. */
export function focusFullGraph(instance: ReactFlowInstance<any, any> | null, canvas: Element | null | undefined, selected: string, neighbors: Set<string>) {
  if (!instance || !canvas) return;
  const nodes = instance.getNodes().filter(node => neighbors.has(node.id));
  if (!nodes.length) return;
  const bounds = instance.getNodesBounds(nodes);
  const pane = canvas.getBoundingClientRect();
  const fitted = getViewportForBounds(bounds, pane.width, pane.height, 0.001, 1, 0.1);
  const minimumNameSize = Math.min(16, ...nodes.map(node => Number.parseFloat(String(node.data.nameCap ?? 16))));
  const readableZoom = NAME_MIN_PX / minimumNameSize + 0.001;
  const neighborsFit = fitted.zoom >= readableZoom;
  const framed = neighborsFit ? nodes : nodes.filter(node => node.id === selected);
  const maximumZoom = neighborsFit ? 1 : readableZoom;
  void instance.fitView({ nodes: framed, minZoom: readableZoom, maxZoom: maximumZoom, padding: 0.1, duration: 0 });
}

/** Opens an existing area at readable scale without moving its nodes or edge routes. */
export function fitGraphArea(instance: ReactFlowInstance<any, any>, canvas: Element, areaId: string, reservedWidth = 0) {
  const area = instance.getNode('area:' + areaId);
  if (!area) return;
  const entities = instance.getNodes().filter(node => node.parentId === area.id);
  const minimumCap = Math.min(16, ...entities.map(node => Number.parseFloat(String(node.data.nameCap ?? 16))));
  const readableZoom = Math.max(0.75, NAME_MIN_PX / minimumCap);
  const bounds = instance.getNodesBounds([area]);
  const pane = canvas.getBoundingClientRect();
  const viewport = getViewportForBounds(bounds, Math.max(1, pane.width - reservedWidth), pane.height, readableZoom, Math.max(1, readableZoom), 0.08);
  void instance.setViewport(viewport, { duration: 0 });
}
