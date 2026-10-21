// Neighborhood walk history (FR-037): each step is a center in a document, reached optionally through
// a relationship. `push` truncates forward history like a browser; pushing the current center again
// is a no-op so re-selecting does not grow the trail.
// v0.3.0 adds expansion steps (`kind: 'expand'`, with the expansion set id): the canvas keeps its
// center and grows. Steps without `kind` are re-centering steps, as in v0.2.0.
export type WalkStep = {
  doc: string;
  center: string;
  name: string;
  via?: { id: string; label: string };
  kind?: 'center' | 'expand';
  set?: string;
};
export type Walk = { steps: WalkStep[]; index: number };
export type WalkAction =
  | { type: 'push'; step: WalkStep }
  | { type: 'back' }
  | { type: 'forward' }
  | { type: 'jump'; index: number }
  | { type: 'reset'; step?: WalkStep };
export const emptyWalk: Walk = { steps: [], index: -1 };
export const MAX_STEPS = 100;
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
export const currentStep = (walk: Walk) => walk.steps[walk.index];
export const canBack = (walk: Walk) => walk.index > 0,
  canForward = (walk: Walk) => walk.index < walk.steps.length - 1;
const isCenter = (s: WalkStep) => (s.kind ?? 'center') === 'center';
// The canvas at the current step: the last re-centering step at or before it, and the expansion
// sets applied after it, in order (Back/Forward restore exactly this).
export function canvasAt(walk: Walk): { center: WalkStep | undefined; sets: string[] } {
  const sets: string[] = [];
  for (let i = walk.index; i >= 0; i--) {
    const s = walk.steps[i];
    if (isCenter(s)) return { center: s, sets: sets.reverse() };
    if (s.set) sets.push(s.set);
  }
  return { center: undefined, sets: sets.reverse() };
}
