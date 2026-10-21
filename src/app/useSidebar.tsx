/** Persists sidebar preferences and manages responsive drawer focus. */
import { useEffect, useRef, useState } from 'react';
import type { ProjectInfo } from '../projects/api';

type Options = { readSidebarWidth: () => number; projects: ProjectInfo[] };
/** Manages sidebar. */
export function useSidebar({ readSidebarWidth, projects }: Options) {
  const [compact, setCompact] = useState(() => window.innerWidth < 1100);
  const [drawerOpen, setSidebarOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(() => {
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
  const [examplesChoice, setExamplesChoice] = useState<boolean | null>(null);
  const examplesOpen = examplesChoice ?? projects.length === 0;
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
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1099px)');
    const change = () => {
      setCompact(media.matches);
      setSidebarOpen(false);
    };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  function closeWorkspace() {
    setSidebarOpen(false);
    requestAnimationFrame(() => workspaceToggle.current?.focus());
  }
  useEffect(() => {
    if (!compact || !sidebarOpen) return;
    const element = sidebarRef.current;
    if (!element) return;
    const focusSelector = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'summary',
      '[tabindex="0"]',
    ].join(',');
    const focusable = () =>
      Array.from(element.querySelectorAll<HTMLElement>(focusSelector)).filter(
        node => node.getClientRects().length > 0,
      );
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
    setExamplesChoice,
    examplesOpen,
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
