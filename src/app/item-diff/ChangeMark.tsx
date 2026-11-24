import type { ChangeState } from '../../shared/item-diff/item-change';

/** Gives each unpublished state a visible text label. */
export function changeLabel(state: ChangeState) {
  return `Not published: ${state}`;
}

/** Adds the annotation and enables the parent surface's dashed outline. */
export function ChangeMark({ change }: { change?: ChangeState }) {
  if (!change) return null;
  return <span className="item-change-mark item-change-dashed">{changeLabel(change)}</span>;
}
