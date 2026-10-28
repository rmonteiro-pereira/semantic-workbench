/** The save state as a button: inline text in the title's meta line, or a dot on a phone. */
import type { AutosaveStatus } from '../projects/autosave';
import { saveNeedsAction } from '../projects/autosave';

type Props = {
  variant: 'inline' | 'dot';
  status: AutosaveStatus;
  hasFile: boolean;
  label: string;
  /** The label in few words; drawn instead of `label` while the header is narrow. */
  shortLabel?: string;
  title: string;
  onClick: () => void;
};

/** Lists the button's classes for its variant and state. */
function buttonClassName({ variant, status, hasFile }: Props): string {
  const classes = ['save-state', `s-${status}`];
  if (variant === 'dot') classes.push('save-dot');
  if (hasFile && saveNeedsAction(status)) classes.push('needs-action');
  return classes.join(' ');
}

/** Renders the save state; it opens Commit, the findings or the diff when clicked. */
export function SaveStateButton(props: Props) {
  const { variant, hasFile, label, shortLabel, title, onClick } = props;
  // The dot on a phone has no text to shorten.
  const hasShortForm = variant === 'inline' && hasFile && !!shortLabel && shortLabel !== label;
  return (
    <button
      className={buttonClassName(props)}
      role="status"
      aria-label="Save state"
      disabled={!hasFile}
      title={title}
      onClick={onClick}
    >
      <span className="save-state-text" data-short={hasShortForm ? shortLabel : undefined}>
        {label}
      </span>
    </button>
  );
}
