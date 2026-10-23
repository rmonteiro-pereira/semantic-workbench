/** Tells a graph canvas when it is zoomed out too far to read card details. */
import { useEffect, useState, type CSSProperties } from 'react';
import { useStore } from '@xyflow/react';

/** Zoom levels below which cards switch to a larger name, from first to last. */
const FAR_ZOOM_LEVELS = [0.6, 0.42, 0.3];
// Taller names would no longer fit the fixed card height. 44 px stays at 12 px on screen down
// to a zoom of about 0.27; below that the names keep shrinking with the canvas.
const LARGEST_NAME_PX = 44;
const READABLE_NAME_PX = 12;

function levelOf(zoom: number) {
  return FAR_ZOOM_LEVELS.filter(limit => zoom < limit).length;
}

// A name drawn at this size stays at least READABLE_NAME_PX on screen anywhere in its level.
function nameSizeOf(level: number) {
  const lowestZoomInLevel = FAR_ZOOM_LEVELS[level];
  if (!lowestZoomInLevel) return LARGEST_NAME_PX;
  return Math.min(LARGEST_NAME_PX, Math.ceil(READABLE_NAME_PX / lowestZoomInLevel));
}

// React Flow only shares its zoom with components inside the canvas, so a child of the canvas
// reports the level to the component that owns it.
function FarZoomWatcher({ onChange }: { onChange: (level: number) => void }) {
  const level = useStore(state => levelOf(state.transform[2]));
  useEffect(() => onChange(level), [level, onChange]);
  return null;
}

/**
 * Returns the class and style for the canvas at its current zoom, both empty while cards are
 * readable, and the element to render inside the canvas.
 */
export function useFarZoom() {
  const [level, setLevel] = useState(0);
  const far = level > 0;
  const style = far
    ? ({ '--far-name-size': `${nameSizeOf(level)}px` } as CSSProperties)
    : undefined;
  return {
    className: far ? 'zoom-far' : undefined,
    style,
    watcher: <FarZoomWatcher onChange={setLevel} />,
  };
}
