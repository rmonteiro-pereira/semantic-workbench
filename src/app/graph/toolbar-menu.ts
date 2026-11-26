/** Behaviour shared by the drop-down menus of the graph toolbars: placement, dismissal and keyboard focus. */
import { useEffect, useLayoutEffect, useState } from 'react';
import type React from 'react';

/** Places the menu under its button and inside the window. */
export function useMenuPosition(button: React.RefObject<HTMLButtonElement | null>, opened: boolean) {
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 0 });
  useLayoutEffect(() => {
    if (!opened) return;
    const place = () => {
      const rect = button.current!.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 20);
      setPosition({
        left: Math.max(10, Math.min(rect.left, window.innerWidth - width - 10)),
        top: rect.bottom + 4,
        maxHeight: Math.max(0, window.innerHeight - rect.bottom - 14),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [opened]);
  return position;
}

/**
 * Closes the menu on Escape or on a click anywhere outside it. Escape also puts focus back on the
 * button that opened the menu, as a menu is expected to.
 */
export function useDismiss(container: React.RefObject<HTMLElement | null>, opened: boolean, close: () => void, trigger: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!opened) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [opened]);
}

/** Focuses the checked item when the menu opens, so the arrow keys start from the current choice. */
export function useFocusCheckedItem(menu: React.RefObject<HTMLElement | null>, opened: boolean) {
  useEffect(() => {
    if (!opened) return;
    const checked = menu.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    const firstItem = menu.current?.querySelector<HTMLElement>('button');
    (checked ?? firstItem)?.focus();
  }, [opened]);
}

/** ArrowDown and ArrowUp move focus between the menu's buttons and wrap around at either end. */
export function moveFocusWithArrows(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button'));
  const step = event.key === 'ArrowDown' ? 1 : -1;
  const next = (items.indexOf(document.activeElement as HTMLElement) + step + items.length) % items.length;
  items[next].focus();
}
