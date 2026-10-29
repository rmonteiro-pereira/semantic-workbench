import { showMoreLabel } from './list-window';

/** Buttons that reveal the next step of a long list or collapse it again. */
export function ShowMoreControl({
  hidden,
  step,
  expanded,
  noun,
  onShowMore,
  onShowFewer,
}: {
  hidden: number;
  step: number;
  expanded: boolean;
  noun: string;
  onShowMore: () => void;
  onShowFewer: () => void;
}) {
  if (!hidden && !expanded) return null;
  return (
    <div className="mapping-show-more">
      {hidden > 0 && (
        <button type="button" onClick={onShowMore}>
          {showMoreLabel(hidden, step)}
          <small>
            {hidden} hidden {noun}
          </small>
        </button>
      )}
      {expanded && (
        <button type="button" onClick={onShowFewer}>
          Show fewer
        </button>
      )}
    </div>
  );
}
