/**
 * Owns the workspace's action history. Each recorded step is mirrored into the browser history,
 * so the Back and Forward buttons, the mouse buttons and the in-app arrows all move the same
 * cursor.
 */
import React, { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { canBack, canForward, positionOf } from './action-history';
import { createActionRecorder, type ActionRecorder } from './action-recorder';

const STATE_KEY = 'workbenchStep';
const SESSION_KEY = 'workbenchSession';

type MirrorState = { [SESSION_KEY]?: string; [STATE_KEY]?: number };

function newSessionId(): string {
  return Math.random().toString(36).slice(2);
}

// The inert recorder used outside the provider (unit tests of single components): nothing is
// recorded and state hooks behave like plain state.
const inertRecorder = createActionRecorder({
  defer: run => run(),
  applyAtomically: run => run(),
  mirrorStep: () => {},
});

const RecorderContext = createContext<ActionRecorder>(inertRecorder);

/** The recorder that state hooks report to. */
export const useActionRecorder = (): ActionRecorder => useContext(RecorderContext);

/** Whether Back or Forward has a step to move to, and the two commands. */
export function useActionHistory() {
  const recorder = useContext(RecorderContext);
  const history = useSyncExternalStore(recorder.subscribe, recorder.snapshot);
  return {
    canBack: canBack(history),
    canForward: canForward(history),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    act: recorder.act,
  };
}

// A click, or a choice in a list or a switch, starts one user action. Typing is not one.
function startsAction(event: Event): boolean {
  if (event.type === 'click') return true;
  const target = event.target as HTMLInputElement | null;
  if (!target || !target.tagName) return false;
  if (target.tagName === 'SELECT') return true;
  return target.tagName === 'INPUT' && ['checkbox', 'radio', 'range'].includes(target.type);
}

/** Provides one action history to the workspace and keeps it in step with the browser's. */
export function ActionHistoryProvider({ children }: { children: React.ReactNode }) {
  const session = useMemo(newSessionId, []);
  const recorder = useMemo(
    () =>
      createActionRecorder({
        defer: run => void setTimeout(run, 0),
        applyAtomically: apply => flushSync(apply),
        mirrorStep: position => {
          const state: MirrorState = { [SESSION_KEY]: session, [STATE_KEY]: position };
          window.history.pushState(state, '');
        },
      }),
    [session],
  );
  useEffect(() => {
    const stamp = (position: number) => {
      const state: MirrorState = { ...window.history.state, [SESSION_KEY]: session };
      state[STATE_KEY] = position;
      window.history.replaceState(state, '');
    };
    stamp(0);
    const openGroup = (event: Event) => {
      if (startsAction(event)) recorder.openGroup('');
    };
    // An Admin page change adds a hash entry the browser created itself; give it our position.
    const stampHashEntry = () => {
      const state = window.history.state as MirrorState | null;
      if (state?.[SESSION_KEY] === session) return;
      stamp(positionOf(recorder.snapshot()));
    };
    // An entry from an earlier session, or one whose step was dropped, has nothing to undo.
    // Going back once more skips it, so Back still leads out of the app.
    const follow = () => {
      const state = window.history.state as MirrorState | null;
      const otherSession = state?.[SESSION_KEY] !== undefined && state[SESSION_KEY] !== session;
      if (otherSession) {
        window.history.back();
        return;
      }
      if (state?.[SESSION_KEY] !== session || typeof state[STATE_KEY] !== 'number') return;
      if (!recorder.travelTo(state[STATE_KEY])) window.history.back();
    };
    document.addEventListener('click', openGroup, true);
    document.addEventListener('change', openGroup, true);
    window.addEventListener('popstate', follow);
    window.addEventListener('hashchange', stampHashEntry);
    return () => {
      document.removeEventListener('click', openGroup, true);
      document.removeEventListener('change', openGroup, true);
      window.removeEventListener('popstate', follow);
      window.removeEventListener('hashchange', stampHashEntry);
    };
  }, [recorder, session]);
  return <RecorderContext.Provider value={recorder}>{children}</RecorderContext.Provider>;
}
