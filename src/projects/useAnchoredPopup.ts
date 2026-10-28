/** Keeps a popup drawn in the window next to the element that opened it, and closes it. */
import { useEffect, useLayoutEffect, type DependencyList, type RefObject } from 'react';
import type { MenuPlacement, Size } from './menu-position';

type PopupElements = {
  popup: RefObject<HTMLElement | null>;
  anchor: RefObject<HTMLElement | null>;
};

/** The popup's width and the height it would have without a height cap, borders included. */
export function popupNaturalSize(popup: HTMLElement): Size {
  const border = popup.offsetHeight - popup.clientHeight;
  return { width: popup.getBoundingClientRect().width, height: popup.scrollHeight + border };
}

/** Decides where the popup goes for the anchor's current box and the window size. */
export type PlacePopup = (popup: HTMLElement, anchor: DOMRect, viewport: Size) => MenuPlacement;

/**
 * Places the popup before the browser paints, then again whenever the popup, the window or a
 * scrolling ancestor changes size or position, so it follows its anchor.
 */
export function useAnchoredPopup(
  open: boolean,
  elements: PopupElements,
  placePopup: PlacePopup,
  dependencies: DependencyList,
) {
  const { popup, anchor } = elements;
  useLayoutEffect(() => {
    if (!open) return;
    const element = popup.current;
    if (!element) return;
    const place = () => {
      const box = anchor.current?.getBoundingClientRect();
      if (!box) return;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const placed = placePopup(element, box, viewport);
      element.style.maxHeight = `${placed.maxHeight}px`;
      element.style.top = `${placed.top}px`;
      element.style.left = `${placed.left}px`;
    };
    let frame = 0;
    const schedulePlace = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    const observer = new ResizeObserver(schedulePlace);
    observer.observe(element);
    window.addEventListener('resize', schedulePlace);
    window.addEventListener('scroll', schedulePlace, true);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedulePlace);
      window.removeEventListener('scroll', schedulePlace, true);
    };
    // The caller lists what its placement depends on; the refs are stable.
  }, [open, ...dependencies]);
}

/**
 * Focuses the popup's first control matching `firstControl` when it opens. A mousedown outside the
 * popup and its anchor dismisses it without moving focus, so the click lands where it was aimed.
 */
export function usePopupDismiss(
  open: boolean,
  elements: PopupElements,
  firstControl: string,
  onDismiss: () => void,
) {
  const { popup, anchor } = elements;
  useEffect(() => {
    if (!open) return;
    const dismissOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const inside = anchor.current?.contains(target) || popup.current?.contains(target);
      if (!inside) onDismiss();
    };
    document.addEventListener('mousedown', dismissOnOutsideClick);
    popup.current?.querySelector<HTMLElement>(firstControl)?.focus();
    return () => document.removeEventListener('mousedown', dismissOnOutsideClick);
    // Callers pass a dismiss that only closes the popup, so the effect need not rerun for it.
  }, [open]);
}
