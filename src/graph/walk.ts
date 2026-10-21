/** Tracks graph centers and expansions as reversible navigation history. */
// Selecting the current center does not add a step; a new step discards forward history. Expansion
// steps keep the center and record their expansion set. Steps without a kind change the center.
/** Records a document center or expansion reached during graph navigation. */
export type WalkStep = {
  doc: string;
  center: string;
  name: string;
  via?: { id: string; label: string };
  kind?: 'center' | 'expand';
  set?: string;
};
/** Stores navigation steps and the active history position. */
export type Walk = { steps: WalkStep[]; index: number };
/** Describes a navigation push, move, jump or reset. */
export type WalkAction =
  | { type: 'push'; step: WalkStep }
  | { type: 'back' }
  | { type: 'forward' }
  | { type: 'jump'; index: number }
  | { type: 'reset'; step?: WalkStep };
export const emptyWalk: Walk = { steps: [], index: -1 };
export const MAX_STEPS = 100;
/** Updates bounded navigation history and discards forward steps after a new branch. */
export function walkReducer(walk: Walk, action: WalkAction): Walk {
  if (action.type === 'back') return walk.index > 0 ? { ...walk, index: walk.index - 1 } : walk;
  if (action.type === 'forward')
    return walk.index < walk.steps.length - 1 ? { ...walk, index: walk.index + 1 } : walk;
  if (action.type === 'jump')
    return action.index >= 0 && action.index < walk.steps.length
      ? { ...walk, index: action.index }
      : walk;
  if (action.type === 'reset') return action.step ? { steps: [action.step], index: 0 } : emptyWalk;
  const current = walk.steps[walk.index];
  if (
    current &&
    current.doc === action.step.doc &&
    current.center === action.step.center &&
    isCenter(current) &&
    isCenter(action.step)
  )
    return walk;
  if (
    current &&
    !isCenter(action.step) &&
    current.set === action.step.set &&
    current.kind === action.step.kind
  )
    return walk;
  const steps = [...walk.steps.slice(0, walk.index + 1), action.step].slice(-MAX_STEPS);
  return { steps, index: steps.length - 1 };
}
/** Returns the active navigation step, if any. */
export const currentStep = (walk: Walk) => walk.steps[walk.index];
/** Checks whether navigation has an earlier step. */
export const canBack = (walk: Walk) => walk.index > 0;
/** Checks whether navigation has a later step. */
export const canForward = (walk: Walk) => walk.index < walk.steps.length - 1;
const isCenter = (s: WalkStep) => (s.kind ?? 'center') === 'center';
// The canvas at the current step: the last re-centering step at or before it, and the expansion
// sets applied after it, in order (Back/Forward restore exactly this).
/** Reconstructs the current center and ordered expansions from navigation history. */
export function canvasAt(walk: Walk): { center: WalkStep | undefined; sets: string[] } {
  const sets: string[] = [];
  for (let i = walk.index; i >= 0; i--) {
    const s = walk.steps[i];
    if (isCenter(s)) return { center: s, sets: sets.reverse() };
    if (s.set) sets.push(s.set);
  }
  return { center: undefined, sets: sets.reverse() };
}
