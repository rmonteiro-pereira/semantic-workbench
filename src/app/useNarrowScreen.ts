/** Says whether the browser window is narrower than the width where the sidebar becomes a drawer. */
import { useEffect, useState } from 'react';

/** Windows narrower than this many pixels get the drawer layout. */
export const NARROW_SCREEN_PX = 1100;

/**
 * Windows narrower than this many pixels get the one-row phone header. The two-row header rules in
 * WorkspaceHeader.css (max-width: 699px) start above it; change both together.
 */
export const PHONE_SCREEN_PX = 651;

/** Tracks whether the window is narrower than the given width. */
function useWindowNarrowerThan(widthPx: number) {
  const [narrow, setNarrow] = useState(() => window.innerWidth < widthPx);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${widthPx - 1}px)`);
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [widthPx]);
  return narrow;
}

/** Tracks the window width against NARROW_SCREEN_PX. */
export function useNarrowScreen() {
  return useWindowNarrowerThan(NARROW_SCREEN_PX);
}

/** Tracks the window width against PHONE_SCREEN_PX. */
export function usePhoneScreen() {
  return useWindowNarrowerThan(PHONE_SCREEN_PX);
}
