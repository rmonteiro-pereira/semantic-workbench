/**
 * Groups the state changes of one click into one history step, and remembers the values of
 * component state that unmounts, so undo and redo can bring a screen back exactly as it was.
 * It touches no DOM: the environment supplies scheduling, rendering and the browser mirror.
 */
import {
  emptyActionHistory,
  isForgotten,
  positionOf,
  record,
  travel,
  type ActionHistory,
  type ActionStep,
} from './action-history';

export type RecorderEnvironment = {
  /** Runs a function after the current event and the renders it caused have finished. */
  defer: (run: () => void) => void;
  /** Applies state changes and renders them before returning, so mounted state is registered. */
  applyAtomically: (apply: () => void) => void;
  /** Adds a browser history entry for a newly recorded step, at the given absolute position. */
  mirrorStep: (position: number) => void;
};

/** A piece of component state the recorder can set from undo and redo. */
export type StateRegistration = {
  restore: (value: unknown) => void;
  read: () => unknown;
};

type Change = { undo: () => void; redo: () => void };
type Group = {
  label: string;
  changes: Change[];
  mounted: Map<string, StateRegistration>;
};

export function createActionRecorder(environment: RecorderEnvironment) {
  let history: ActionHistory = emptyActionHistory;
  let group: Group | null = null;
  let replaying = 0;
  const listeners = new Set<() => void>();
  const registry = new Map<string, StateRegistration>();
  // The last value each keyed state is known to have had, for screens that are not mounted now.
  const known = new Map<string, unknown>();
  // Keys whose value undo or redo set and no screen has picked up yet. A screen that loads its
  // data first mounts its state after the replay is over, and still has to find its value.
  const awaiting = new Set<string>();

  function publish(next: ActionHistory) {
    history = next;
    listeners.forEach(listener => listener());
  }

  function stage(key: string, value: unknown) {
    known.set(key, value);
    awaiting.add(key);
  }

  function setKnown(key: string, value: unknown) {
    stage(key, value);
    const mounted = registry.get(key);
    if (!mounted) return;
    awaiting.delete(key);
    mounted.restore(value);
  }

  function closeGroup() {
    const closing = group;
    group = null;
    if (!closing) return;
    const mountChanges = [...closing.mounted].map(([key, registration]) => {
      const value = registration.read();
      return { undo: () => {}, redo: () => stage(key, value) };
    });
    const changes = [...mountChanges, ...closing.changes];
    if (changes.length === 0) return;
    const step: ActionStep = {
      label: closing.label,
      undo: () => [...changes].reverse().forEach(change => change.undo()),
      redo: () => changes.forEach(change => change.redo()),
    };
    publish(record(history, step));
    environment.mirrorStep(positionOf(history));
  }

  /** Starts collecting changes for one user action; they become one step when the event ends. */
  function openGroup(label: string) {
    if (group || replaying) return;
    awaiting.clear();
    group = { label, changes: [], mounted: new Map() };
    environment.defer(closeGroup);
  }

  /** Runs a function as one user action, also when no click is in progress (async results). */
  function act<Result>(label: string, run: () => Result): Result {
    openGroup(label);
    return run();
  }

  function noteChange(label: string, change: Change) {
    if (!group || replaying) return;
    if (group.changes.length === 0 && group.label === '') group.label = label;
    group.changes.push(change);
  }

  function noteSet(key: string, previous: unknown, next: unknown) {
    noteChange(key, {
      undo: () => setKnown(key, previous),
      redo: () => setKnown(key, next),
    });
  }

  function noteCommand(label: string, command: Change) {
    noteChange(label, command);
  }

  // Two screens mounted together under one key would overwrite each other's value on undo.
  function warnAboutKeyClash(key: string, registration: StateRegistration) {
    if (!import.meta.env.DEV) return;
    const existing = registry.get(key);
    if (existing && existing !== registration) {
      console.warn(`Recorded state key "${key}" is already used by another mounted screen.`);
    }
  }

  function mount(key: string, registration: StateRegistration) {
    warnAboutKeyClash(key, registration);
    registry.set(key, registration);
    known.set(key, registration.read());
    if (group && !replaying) group.mounted.set(key, registration);
  }

  function unmount(key: string, registration: StateRegistration, last: unknown) {
    if (registry.get(key) === registration) registry.delete(key);
    known.set(key, last);
    if (!group || replaying) return;
    group.mounted.delete(key);
    noteChange(key, { undo: () => stage(key, last), redo: () => {} });
  }

  /** The value a state starts with: during undo and redo, the one the screen had when it left. */
  function restoredValue<Value>(key: string, fallback: () => Value): Value {
    const staged = (replaying || awaiting.has(key)) && known.has(key);
    awaiting.delete(key);
    return staged ? (known.get(key) as Value) : fallback();
  }

  /** Moves to a position and returns false when the position is older than any kept step. */
  function travelTo(position: number): boolean {
    if (isForgotten(history, position)) return false;
    const result = travel(history, position);
    if (result.moves.length === 0) return true;
    publish(result.history);
    replaying++;
    for (const move of result.moves) {
      environment.applyAtomically(move.direction === 'undo' ? move.step.undo : move.step.redo);
    }
    environment.defer(() => replaying--);
    return true;
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    snapshot: () => history,
    isReplaying: () => replaying > 0,
    openGroup,
    act,
    noteSet,
    noteCommand,
    mount,
    unmount,
    restoredValue,
    travelTo,
  };
}

export type ActionRecorder = ReturnType<typeof createActionRecorder>;
