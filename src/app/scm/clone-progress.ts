// Keeps clone outcomes ordered even when events and the start response arrive in one render.
import type { CloneEvent } from '../projects/api';

/** Identifies the clone accepted by the server. */
export type CloneOperation = { op: string; name: string };

/** Retains early events until their operation becomes active. */
export type CloneProgressState = {
  operation: CloneOperation | null;
  progress: CloneEvent | null;
  events: Record<string, CloneEvent>;
};

/** Records either a start response or an event from the workspace stream. */
export type CloneProgressAction = { type: 'started'; operation: CloneOperation } | { type: 'progress'; event: CloneEvent } | { type: 'reset' };

/** Empty state for a newly opened clone dialog. */
export const initialCloneProgress: CloneProgressState = {
  operation: null,
  progress: null,
  events: {},
};

/** Applies responses and events against the latest state rather than a render's captured state. */
export function cloneProgressReducer(state: CloneProgressState, action: CloneProgressAction): CloneProgressState {
  if (action.type === 'reset') return initialCloneProgress;
  if (action.type === 'started') {
    const operation = action.operation;
    const progress = state.events[operation.op] ?? {
      op: operation.op,
      name: operation.name,
      phase: 'cloning',
    };
    return { ...state, operation, progress };
  }
  const event = action.event;
  const events = { ...state.events, [event.op]: event };
  if (event.op !== state.operation?.op) return { ...state, events };
  return { ...state, events, progress: event };
}
