/** Keeps the full-screen entry and exit control shared across graph views. */
import { Maximize2, Minimize2 } from 'lucide-react';
import type { Fullscreen } from './fullscreen';

/** Toggles the graph's full-screen view. */
export const FullscreenButton = ({ fullscreen }: { fullscreen: Fullscreen }) => (
  <button
    className="fullscreen-toggle"
    onClick={fullscreen.toggle}
    aria-pressed={fullscreen.active}
    aria-label={fullscreen.active ? 'Exit full screen' : 'Enter full screen'}
    title={fullscreen.active ? 'Exit full screen (Esc)' : 'Full screen (F)'}
  >
    {fullscreen.active ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
    {fullscreen.active && 'Exit full screen'}
  </button>
);
