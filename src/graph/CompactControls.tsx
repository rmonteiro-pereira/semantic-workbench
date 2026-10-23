/** Keeps a graph toolbar to one short row on a phone by folding its secondary controls away. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import './graph-canvas.css';

/** Windows at most this many pixels wide get the folded toolbar. */
export const COMPACT_TOOLBAR_PX = 650;

/** Tracks whether the window is narrow enough for the folded toolbar. */
export function useCompactToolbar() {
  const [compact, setCompact] = useState(() => window.innerWidth <= COMPACT_TOOLBAR_PX);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${COMPACT_TOOLBAR_PX}px)`);
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return compact;
}

// The panel is fixed to the window so the toolbar's own scrolling cannot clip it.
function usePanelTop(button: React.RefObject<HTMLButtonElement | null>, open: boolean) {
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    if (open && button.current) setTop(button.current.getBoundingClientRect().bottom + 4);
  }, [open, button]);
  return top;
}

/**
 * On a wide window the children sit in the toolbar as they are. On a phone they sit in a panel
 * behind one button, so the canvas keeps its height.
 */
export function CompactControls({
  label = 'Controls',
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  const compact = useCompactToolbar();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const top = usePanelTop(button, open);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);
  if (!compact) return <>{children}</>;
  return (
    <span className="compact-controls">
      <button
        ref={button}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(value => !value)}
      >
        <SlidersHorizontal size={14} />
        {label}
      </button>
      {open && (
        <div
          className="compact-controls-panel"
          role="group"
          aria-label="Graph controls"
          style={{ top }}
        >
          {children}
        </div>
      )}
    </span>
  );
}
