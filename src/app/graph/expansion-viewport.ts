import { getViewportForBounds, type Rect, type Viewport, type XYPosition } from '@xyflow/react';

/** Describes the graph pane's visible dimensions. */
export type ExpansionPane = { width: number; height: number };

/** Chooses one readable viewport without briefly exposing the whole expanded canvas. */
export function expansionViewport(bounds: Rect, origin: XYPosition, pane: ExpansionPane, readableZoom: number): Viewport {
  const fitted = getViewportForBounds(bounds, pane.width, pane.height, 0.05, 2, 0.08);
  if (fitted.zoom >= readableZoom) return fitted;

  // Publishing a fit-all viewport first would mount offscreen nodes before panning back.
  return {
    x: pane.width / 2 - origin.x * readableZoom,
    y: pane.height / 2 - origin.y * readableZoom,
    zoom: readableZoom,
  };
}
