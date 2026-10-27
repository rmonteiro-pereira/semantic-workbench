/** Zoom in and zoom out buttons that live in a graph toolbar instead of floating over the canvas. */
import { Minus, Plus } from 'lucide-react';

/** Renders the two zoom buttons; the graph supplies what zooming does. */
export function ZoomButtons({
  onZoomIn,
  onZoomOut,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  return (
    <span className="zoom-buttons">
      <button onClick={onZoomOut} aria-label="Zoom out" title="Zoom out">
        <Minus size={14} />
      </button>
      <button onClick={onZoomIn} aria-label="Zoom in" title="Zoom in">
        <Plus size={14} />
      </button>
    </span>
  );
}
