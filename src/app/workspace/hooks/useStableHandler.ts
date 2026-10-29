/** Keeps workspace event handlers stable without retaining an older document snapshot. */
import { useLayoutEffect, useMemo, useRef } from 'react';

/**
 * Calls the latest committed handler from event handlers or passive effects.
 * Never call during render or child layout effects: children run before the parent publishes it.
 */
export function useStableHandler<Arguments extends unknown[], Result>(action: (...args: Arguments) => Result): (...args: Arguments) => Result {
  const latest = useRef(action);
  // Publish only committed handlers so interrupted renders cannot change an active control.
  useLayoutEffect(() => {
    latest.current = action;
  });
  return useMemo(() => forwardToLatestHandler(latest), []);
}

/** Creates a callback that reads the handler published in the supplied reference at call time. */
function forwardToLatestHandler<Arguments extends unknown[], Result>(latest: { current: (...args: Arguments) => Result }): (...args: Arguments) => Result {
  return (...args: Arguments) => latest.current(...args);
}
