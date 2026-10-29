/** Persists sidebar preferences and manages responsive drawer focus. */
import { useRecordedState } from './useRecordedState';
import { useEffect, useRef, useState } from 'react';
import { useNarrowScreen } from './useNarrowScreen';
import { DIALOG_CLOSED_EVENT, DIALOG_OPENED_EVENT } from '../../projects/Modal';

/** Keeps sidebar widths within the supported desktop range. */
export const clampSidebarWidth = (width: number) => Math.max(220, Math.min(520, Math.round(width)));

/** Reads a valid persisted width, or the default width when storage is unavailable. */
function readSidebarWidth(): number {
  try {
    const stored = localStorage.getItem('workbench.sidebarWidth');
    const width = Number(stored);
    if (stored?.trim() && Number.isFinite(width)) return clampSidebarWidth(width);
  } catch {}
  return 300;
}

/** Manages sidebar. */
export function useSidebar() {
  const compact = useNarrowScreen();
  const [drawerOpen, setSidebarOpen, setSidebarOpenSilently] = useRecordedState('sidebar.drawer', false);
  const [sidebarHidden, setSidebarHidden] = useRecordedState('sidebar.hidden', () => {
    try {
      return localStorage.getItem('workbench.sidebarHidden') === 'true';
    } catch {
      return false;
    }
  });
  const sidebarOpen = compact ? drawerOpen : !sidebarHidden;
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const [resizingSidebar, setResizingSidebar] = useState(false);
  const sidebarDrag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem('workbench.sidebarWidth', String(sidebarWidth));
    } catch {}
  }, [sidebarWidth]);
  useEffect(() => {
    try {
      localStorage.setItem('workbench.sidebarHidden', String(sidebarHidden));
    } catch {}
  }, [sidebarHidden]);
  useEffect(() => {
    if (compact || !sidebarOpen) {
      sidebarDrag.current = null;
      setResizingSidebar(false);
    }
  }, [compact, sidebarOpen]);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const workspaceToggle = useRef<HTMLButtonElement | null>(null);
  // Crossing the breakpoint in either direction starts with the drawer closed.
  useEffect(() => {
    setSidebarOpenSilently(false);
  }, [compact]);
  // A dialog opened from the drawer must not leave the drawer open behind it. The trigger is
  // then out of reach, so focus goes to the workspace button when the dialog closes.
  const drawerOpenRef = useRef(false);
  drawerOpenRef.current = compact && drawerOpen;
  useEffect(() => {
    let focusToggleOnClose = false;
    const closeDrawer = () => {
      focusToggleOnClose = drawerOpenRef.current;
      setSidebarOpen(false);
    };
    const restoreFocus = () => {
      const lost = !document.activeElement || document.activeElement === document.body;
      if (focusToggleOnClose && lost) workspaceToggle.current?.focus();
      focusToggleOnClose = false;
    };
    window.addEventListener(DIALOG_OPENED_EVENT, closeDrawer);
    window.addEventListener(DIALOG_CLOSED_EVENT, restoreFocus);
    return () => {
      window.removeEventListener(DIALOG_OPENED_EVENT, closeDrawer);
      window.removeEventListener(DIALOG_CLOSED_EVENT, restoreFocus);
    };
  }, []);
  function closeWorkspace() {
    setSidebarOpen(false);
    requestAnimationFrame(() => workspaceToggle.current?.focus());
  }
  useEffect(() => {
    if (!compact || !sidebarOpen) return;
    const element = sidebarRef.current;
    if (!element) return;
    const focusSelector = ['button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])', 'summary', '[tabindex="0"]'].join(',');
    const focusable = () => Array.from(element.querySelectorAll<HTMLElement>(focusSelector)).filter(node => node.getClientRects().length > 0);
    focusable()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeWorkspace();
      } else if (event.key === 'Tab') {
        const nodes = focusable();
        const first = nodes[0];
        const last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    element.addEventListener('keydown', keyboard);
    return () => element.removeEventListener('keydown', keyboard);
  }, [compact, sidebarOpen]);

  return {
    compact,
    closeWorkspace,
    sidebarOpen,
    resizingSidebar,
    sidebarWidth,
    sidebarRef,
    sidebarDrag,
    setResizingSidebar,
    setSidebarWidth,
    workspaceToggle,
    setSidebarOpen,
    setSidebarHidden,
  };
}
