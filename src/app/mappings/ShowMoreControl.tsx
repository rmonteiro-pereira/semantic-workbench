/** Text buttons that reveal more items of a long list or fold it back. */
export function ShowMoreControl({
  showMoreLabel,
  expanded,
  onShowMore,
  onShowFewer,
}: {
  /** The label for revealing more, or an empty string when nothing is hidden. */
  showMoreLabel: string;
  expanded: boolean;
  onShowMore: () => void;
  onShowFewer: () => void;
}) {
  if (!showMoreLabel && !expanded) return null;
  return (
    <div className="mapping-show-more">
      {showMoreLabel && (
        <button type="button" onClick={onShowMore}>
          {showMoreLabel}
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
