/** Says whether the browser window is narrower than the width where the sidebar becomes a drawer. */
import { useEffect, useState } from 'react';

/** Windows narrower than this many pixels get the drawer layout. */
export const NARROW_SCREEN_PX = 1100;

/** Tracks the window width against NARROW_SCREEN_PX. */
export function useNarrowScreen() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < NARROW_SCREEN_PX);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${NARROW_SCREEN_PX - 1}px)`);
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return narrow;
}
