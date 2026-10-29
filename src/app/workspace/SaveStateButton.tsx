/** The save state as a button: inline text in the title's meta line, or a dot on a phone. */
import type { AutosaveStatus } from '../projects/autosave';
import { saveNeedsAction } from '../projects/autosave';

type Props = {
  variant: 'inline' | 'dot';
  status: AutosaveStatus;
  hasFile: boolean;
  label: string;
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
  const { hasFile, label, title, onClick } = props;
  return (
    <button className={buttonClassName(props)} role="status" aria-label="Save state" disabled={!hasFile} title={title} onClick={onClick}>
      <span className="save-state-text">{label}</span>
    </button>
  );
}
