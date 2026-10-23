/** Explains an empty panel in one title and one sentence that names the next step. */
import type { ReactNode } from 'react';

/** Renders an icon, a title and the sentence that says what to do about the empty panel. */
export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="odcs-empty-state" role="status">
      {icon}
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
