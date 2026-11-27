import { ArrowLeft } from 'lucide-react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { showSectionTop } from './section-scroll';
import { LastAdminNotice } from './AdminNotices';

/** Lets an editor or detail view hand control back to the list it came from. */
export type PaneProps = { onBack: () => void };

/**
 * Takes the place of a section's list while one item is edited or inspected, with a way back.
 * Panes keep long forms on the page instead of in a dialog.
 */
export function AdminPane({
  title,
  backLabel,
  onBack,
  children,
  lastAdminNotice = false,
}: PaneProps & {
  title: string;
  /** Names the list the person returns to, as in "Back to grants". */
  backLabel: string;
  children: ReactNode;
  /** Set on the panes where a change could remove the last active Admin. */
  lastAdminNotice?: boolean;
}) {
  const pane = useRef<HTMLElement>(null);
  // The pane replaces a list the person may have scrolled far down, so it opens at the section's top.
  useLayoutEffect(() => showSectionTop(pane.current), []);
  return (
    <section ref={pane} className="admin-pane" aria-label={title}>
      <div className="admin-pane-header">
        <button onClick={onBack}>
          <ArrowLeft size={15} aria-hidden="true" />
          {backLabel}
        </button>
        <h3>{title}</h3>
      </div>
      {lastAdminNotice && <LastAdminNotice />}
      {children}
    </section>
  );
}
