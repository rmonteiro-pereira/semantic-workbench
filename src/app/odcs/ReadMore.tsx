/** Shows long prose clamped to a few lines, with a button to read the rest. */
import React, { useState } from 'react';
// Short text has nothing to expand, so the button appears only past this length.
const CLAMP_THRESHOLD = 240;

/** Reports whether the text is long enough to be clamped. */
export const isLongText = (content: string) =>
  content.length > CLAMP_THRESHOLD || content.split('\n').length > 3;

/** Renders the text clamped to three lines until the reader expands it. */
export function ReadMore({ children, className = '' }: { children: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const long = isLongText(children);
  return (
    <div className={`odcs-read-more ${className}`.trim()}>
      <p className={long && !open ? 'odcs-clamp-3' : undefined}>{children}</p>
      {long && (
        <button
          type="button"
          className="odcs-link"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}
