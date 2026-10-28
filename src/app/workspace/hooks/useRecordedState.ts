/** State that Back and Forward can undo and redo when a click changes it. */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useActionRecorder } from '../ActionHistoryContext';

type Update<Value> = Value | ((previous: Value) => Value);

/**
 * Works like `useState`. A change made while a click is being handled joins that click's history
 * step. The key names this state across screens, so a screen that comes back finds its old value.
 * Keys must be unique among the screens mounted at the same time.
 * The third value changes state without recording, for resets that follow a recorded change.
 */
export function useRecordedState<Value>(
  key: string,
  initial: Value | (() => Value),
  reconcile: (shown: Value, restored: Value) => Value = (_shown, restored) => restored,
): [Value, (update: Update<Value>) => void, (update: Update<Value>) => void] {
  const recorder = useActionRecorder();
  const resolveInitial = () => (initial instanceof Function ? initial() : initial);
  const [value, setValue] = useState<Value>(() => recorder.restoredValue(key, resolveInitial));
  const latest = useRef(value);

  const change = useCallback(
    (update: Update<Value>, recorded: boolean) => {
      if (recorder.isReplaying()) return;
      const previous = latest.current;
      const next = update instanceof Function ? update(previous) : update;
      if (Object.is(previous, next)) return;
      latest.current = next;
      setValue(next);
      if (recorded) recorder.noteSet(key, previous, next);
    },
    [recorder, key],
  );
  const set = useCallback((update: Update<Value>) => change(update, true), [change]);
  const setSilently = useCallback((update: Update<Value>) => change(update, false), [change]);

  useLayoutEffect(() => {
    const registration = {
      restore: (restored: unknown) => {
        const next = reconcile(latest.current, restored as Value);
        latest.current = next;
        setValue(next);
      },
      read: () => latest.current,
    };
    recorder.mount(key, registration);
    return () => recorder.unmount(key, registration, latest.current);
  }, [recorder, key]);

  return [value, set, setSilently];
}
