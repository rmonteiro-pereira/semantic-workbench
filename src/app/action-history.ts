/** Pure history of the actions a person made by clicking, so Back can undo and Forward redo them. */

/** One recorded action. Undo and redo apply the change and must not record anything themselves. */
export type ActionStep = {
  label: string;
  undo: () => void;
  redo: () => void;
};

/**
 * The recorded steps and a cursor. `dropped` counts steps forgotten from the old end, so a step's
 * absolute position stays the same when the list is trimmed.
 */
export type ActionHistory = {
  steps: readonly ActionStep[];
  cursor: number;
  dropped: number;
};

/** A step to apply while moving, and the direction to apply it in. */
export type ActionMove = { step: ActionStep; direction: 'undo' | 'redo' };

export const MAX_ACTIONS = 200;

export const emptyActionHistory: ActionHistory = { steps: [], cursor: 0, dropped: 0 };

/** The absolute position of the cursor: how many steps have ever been applied. */
export function positionOf(history: ActionHistory): number {
  return history.dropped + history.cursor;
}

/** Adds a step after the cursor. Steps that had been undone are forgotten. */
export function record(history: ActionHistory, step: ActionStep): ActionHistory {
  const kept = [...history.steps.slice(0, history.cursor), step];
  const overflow = Math.max(0, kept.length - MAX_ACTIONS);
  return {
    steps: kept.slice(overflow),
    cursor: kept.length - overflow,
    dropped: history.dropped + overflow,
  };
}

export const canBack = (history: ActionHistory): boolean => history.cursor > 0;

export const canForward = (history: ActionHistory): boolean =>
  history.cursor < history.steps.length;

/** Whether a position is older than the oldest step still kept, so it can no longer be reached. */
export const isForgotten = (history: ActionHistory, position: number): boolean =>
  position < history.dropped;

/**
 * Moves the cursor to an absolute position, clamped to the steps that are still known, and lists
 * the steps to undo (newest first) or redo (oldest first) on the way.
 */
export function travel(
  history: ActionHistory,
  position: number,
): { history: ActionHistory; moves: ActionMove[] } {
  const target = Math.min(Math.max(position - history.dropped, 0), history.steps.length);
  const moves: ActionMove[] = [];
  for (let index = history.cursor - 1; index >= target; index--) {
    moves.push({ step: history.steps[index], direction: 'undo' });
  }
  for (let index = history.cursor; index < target; index++) {
    moves.push({ step: history.steps[index], direction: 'redo' });
  }
  return { history: { ...history, cursor: target }, moves };
}

/** One step back, as a move to the position before the cursor. */
export function back(history: ActionHistory) {
  return travel(history, positionOf(history) - 1);
}

/** One step forward, as a move to the position after the cursor. */
export function forward(history: ActionHistory) {
  return travel(history, positionOf(history) + 1);
}
