/** Fits whole-model nodes using their compound positions and measured card dimensions. */
import { getViewportForBounds, type ReactFlowInstance } from '@xyflow/react';
import { MODEL_CARD_WIDTH } from './overview-capacity';

/** Fits all current nodes, retaining the current viewport when the pane is hidden. */
export function fitFullGraph(instance: ReactFlowInstance<any, any> | null, canvas: Element | null | undefined, duration: number) {
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
  void instance.setViewport(getViewportForBounds({ x, y, width, height }, rect.width, rect.height, 0.001, 1, 0.12), { duration: startsValid ? duration : 0 });
}
