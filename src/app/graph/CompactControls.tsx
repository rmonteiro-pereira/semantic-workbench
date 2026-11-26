/** Keeps a graph toolbar to one short row on a phone by folding its secondary controls away. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import './graph-canvas.css';

/** Windows at most this many pixels wide get the folded toolbar. */
export const COMPACT_TOOLBAR_PX = 650;

/** Tracks whether the window is narrow enough for the folded toolbar. */
export function useCompactToolbar(maxWidth = COMPACT_TOOLBAR_PX) {
  const [compact, setCompact] = useState(() => window.innerWidth <= maxWidth);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [maxWidth]);
  return compact;
}

// The panel is fixed to the window so the toolbar's own scrolling cannot clip it.
function usePanelPosition(button: React.RefObject<HTMLButtonElement | null>, open: boolean) {
  const [position, setPosition] = useState({ top: 0, left: 8, right: 8 });
  const positionPanel = () => {
    const trigger = button.current;
    if (!open || !trigger) return;
    const pane = trigger.closest('.full-graph, .neighborhood-graph')?.getBoundingClientRect();
    const next = {
      top: trigger.getBoundingClientRect().bottom + 4,
      left: Math.max(8, (pane?.left ?? 0) + 8),
      right: Math.max(8, window.innerWidth - (pane?.right ?? window.innerWidth) + 8),
    };
    setPosition(previous => (previous.top === next.top && previous.left === next.left && previous.right === next.right ? previous : next));
  };
  useLayoutEffect(positionPanel);
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
    document.addEventListener('fullscreenchange', positionPanel);
    return () => {
      window.removeEventListener('resize', positionPanel);
      window.removeEventListener('scroll', positionPanel, true);
      document.removeEventListener('fullscreenchange', positionPanel);
    };
  }, [open, button]);
  return position;
}

/**
 * On a wide window the children sit in the toolbar as they are. On a phone they sit in a panel
 * behind one button, so the canvas keeps its height.
 */
export function CompactControls({ label = 'Controls', children, folded = false }: { label?: string; children: ReactNode; folded?: boolean }) {
  const compact = useCompactToolbar();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const position = usePanelPosition(button, open);
  useEffect(() => {
    const canvas = button.current?.closest('.canvas-row');
    if (!canvas) return;
    // The panel closes when the canvas changes shape: full screen toggles, or the details sheet
    // opens below the graph and the panel would lie over its controls.
    const shapeOf = () => ['is-fullscreen', 'has-inspector'].map(name => canvas.classList.contains(name)).join();
    let shape = shapeOf();
    const observer = new MutationObserver(() => {
      const current = shapeOf();
      if (current !== shape) setOpen(false);
      shape = current;
    });
    observer.observe(canvas, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [compact]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);
  if (!compact && !folded) return <>{children}</>;
  return (
    <span className="compact-controls">
      <button ref={button} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(value => !value)}>
        <SlidersHorizontal size={14} />
        {label}
      </button>
      {open && (
        <div className="compact-controls-panel" role="group" aria-label="Graph controls" style={position}>
          {children}
        </div>
      )}
    </span>
  );
}
