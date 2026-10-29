/** Tells a graph canvas when it is zoomed out too far to read card details. */
import { useLayoutEffect, useState, type CSSProperties } from 'react';
import { useStore } from '@xyflow/react';

// Detail lines are 12 px, so cards drop them below their natural scale.
// Each lower level makes the name larger again.
/** Zoom levels below which cards switch to a larger name, from first to last. */
const FAR_ZOOM_LEVELS = [1, 0.75, 0.6, 0.45, 0.35, 0.28];
/** The lowest zoom a first view uses: names are at 12 px there, and a wider canvas is panned. */
export const LOWEST_FIT_ZOOM = 0.3;
/** The zoom at which cards are drawn at their natural size. */
export const DETAIL_ZOOM = FAR_ZOOM_LEVELS[0];
const BASE_NAME_PX = 18;
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
  const readable = Math.ceil(READABLE_NAME_PX / lowestZoomInLevel);
  return Math.max(BASE_NAME_PX, Math.min(LARGEST_NAME_PX, readable));
}

// React Flow only shares its zoom with components inside the canvas, so a child of the canvas
// reports the level to the component that owns it.
function FarZoomWatcher({ onChange }: { onChange: (level: number) => void }) {
  const level = useStore(state => levelOf(state.transform[2]));
  useLayoutEffect(() => onChange(level), [level, onChange]);
  return null;
}

/**
 * Returns the class and style for the canvas at its current zoom, both empty while cards are
 * readable, and the element to render inside the canvas.
 */
export function useFarZoom() {
  const [level, setLevel] = useState(0);
  const far = level > 0;
  const style = far ? ({ '--far-name-size': `${nameSizeOf(level)}px` } as CSSProperties) : undefined;
  return {
    className: far ? 'zoom-far' : undefined,
    style,
    labelScale: far ? nameSizeOf(level) / READABLE_NAME_PX : 1,
    watcher: <FarZoomWatcher onChange={setLevel} />,
  };
}
