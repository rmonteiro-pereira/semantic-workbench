/** A panel that has nothing to show yet: what is missing and the next step to take. */
import './empty-state.css';
import type { ReactNode } from 'react';

type Props = {
  /** What is missing, in a few words. */
  title: string;
  /** One sentence that says why, or how to fill it. */
  children?: ReactNode;
  /** The control that takes the next step, such as a button. */
  action?: ReactNode;
};

/** Centres a short explanation and the next step where a list or a pane would be. */
export function EmptyState({ title, children, action }: Props) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
