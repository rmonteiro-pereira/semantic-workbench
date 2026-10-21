import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
// Full screen for Graph and Neighborhood (FR-066): the canvas row (graph plus inspector) fills the
// screen through the Fullscreen API, or the browser window when the API is refused or missing.
// Escape or the exit control leaves it, and the view (pan and zoom) at entry is put back.
export type Viewport = { x: number; y: number; zoom: number };
// Remembers the view when full screen starts and hands it back once when it ends.
export function createViewMemory() {
  let saved: Viewport | null = null;
  return {
    enter(v: Viewport) {
      saved = { ...v };
    },
    exit(): Viewport | null {
      const v = saved;
      saved = null;
      return v;
    },
    get pending() {
      return saved !== null;
    },
  };
}
export type Fullscreen = {
  active: boolean;
  fallback: boolean;
  enter: () => void;
  exit: () => void;
  toggle: () => void;
};
export function useFullscreen(target: RefObject<HTMLElement | null>, enabled = true): Fullscreen {
  const [active, setActive] = useState(false);
  const [fallback, setFallback] = useState(false);
  const enter = useCallback(() => {
    const el = target.current;
    if (!el || !enabled) return;
    // The window-filling mode is used when the browser refuses (or lacks) the Fullscreen API.
    const fill = () => {
      setFallback(true);
      setActive(true);
    };
    if (typeof el.requestFullscreen !== 'function') {
      fill();
      return;
    }
    el.requestFullscreen()
      .then(() => {
        setFallback(false);
        setActive(true);
      })
      .catch(fill);
  }, [target, enabled]);
  const exit = useCallback(() => {
    if (document.fullscreenElement && document.fullscreenElement === target.current)
      void document.exitFullscreen().catch(() => {});
    setActive(false);
    setFallback(false);
  }, [target]);
  const state = useRef({ active, fallback });
  state.current = { active, fallback };
  // The browser ends native full screen on Escape by itself; follow it.
  useEffect(() => {
    const change = () => {
      if (!document.fullscreenElement && state.current.active && !state.current.fallback)
        setActive(false);
    };
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  useEffect(() => {
    if (!active) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        exit();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [active, exit]);
  useEffect(() => {
    if (!enabled && state.current.active) exit();
  }, [enabled, exit]);
  return { active, fallback, enter, exit, toggle: () => (active ? exit() : enter()) };
}
// For a React Flow canvas: save the viewport when full screen starts; when it ends, ignore the
// resize refit for a moment and put the saved viewport back.
export function useViewRestore(
  active: boolean,
  getViewport: () => Viewport | undefined,
  setViewport: (v: Viewport) => void,
) {
  const memory = useRef(createViewMemory());
  const holdUntil = useRef(0);
  const was = useRef(active);
  useEffect(() => {
    if (active === was.current) return;
    was.current = active;
    if (active) {
      const v = getViewport();
      if (v) memory.current.enter(v);
      return;
    }
    const v = memory.current.exit();
    if (!v) return;
    holdUntil.current = performance.now() + 700;
    // After the layout settles at its old size (two frames, then once more after the resize refit window).
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setViewport(v));
    });
    const timer = setTimeout(() => setViewport(v), 250);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [active]);
  // True while an automatic refit should not run (right after leaving full screen).
  return useCallback(() => performance.now() < holdUntil.current, []);
}
