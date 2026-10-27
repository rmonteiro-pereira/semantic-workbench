/** Provides keyboard-accessible menus that return focus to their trigger when closed. */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  placeFlyout,
  placeMenu,
  type MenuPlacement,
  type MenuPreference,
  type Size,
} from './menu-position';
// Arrow keys move between menu items; Escape or an outside click restores button focus. Disabled
// items stay visible with an accessible explanation.
/** Defines a menu action, icon and optional disabled explanation. */
export type MenuItem = {
  label: string;
  run: () => void;
  icon?: React.ReactNode;
  disabled?: string | false;
  hint?: string;
  /** A second line under the label, for items that need a short description. */
  detail?: string;
};
/** Draws the menu inside the open dialog that holds its button, which hides the rest of the page. */
function menuHost(button: HTMLElement | null): HTMLElement {
  return button?.closest<HTMLElement>('dialog[open]') ?? document.body;
}
/** The menu's width and the height it would have without a height cap, borders included. */
function naturalSize(menu: HTMLElement): Size {
  const border = menu.offsetHeight - menu.clientHeight;
  return { width: menu.getBoundingClientRect().width, height: menu.scrollHeight + border };
}
/** Opens a keyboard-accessible action menu and restores focus when it closes. */
export function MenuButton({
  label,
  ariaLabel,
  icon,
  items,
  className = '',
  buttonClassName = '',
  align = 'end',
  placement = 'below',
  matchButtonWidth = false,
  flyoutBesideSidebar = false,
  title,
  header,
  menuLabel,
}: {
  label?: React.ReactNode;
  ariaLabel: string;
  icon?: React.ReactNode;
  items: MenuItem[];
  className?: string;
  buttonClassName?: string;
  align?: 'start' | 'end';
  /** The side the menu prefers; it flips when there is no room there. */
  placement?: 'below' | 'above';
  /** Makes the menu as wide as the button's wrapper, as for a full-width sidebar button. */
  matchButtonWidth?: boolean;
  /**
   * Opens the menu against the right side of the button, bottom-aligned with it. On a phone, or
   * without room on the right, the menu uses its normal placement.
   */
  flyoutBesideSidebar?: boolean;
  title?: string;
  header?: React.ReactNode;
  menuLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const close = (focus = true) => {
    setOpen(false);
    if (focus) button.current?.focus();
  };
  // The menu is drawn in the window, not inside the panel that holds its button, so a scrolling or
  // masked list cannot clip or fade it. It follows the button and flips when there is no room.
  useLayoutEffect(() => {
    if (!open) return;
    const menu = popup.current;
    if (!menu) return;
    const preference: MenuPreference = { side: placement, align };
    const place = () => {
      const anchor = button.current?.getBoundingClientRect();
      if (!anchor) return;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const flyout = flyoutBesideSidebar ? placeBesideButton(menu, anchor, viewport) : undefined;
      const placed = flyout ?? placeNormally(menu, anchor, viewport);
      menu.style.maxHeight = `${placed.maxHeight}px`;
      menu.style.top = `${placed.top}px`;
      menu.style.left = `${placed.left}px`;
    };
    const placeBesideButton = (menu: HTMLElement, anchor: DOMRect, viewport: Size) => {
      menu.style.width = '';
      return placeFlyout(anchor, naturalSize(menu), viewport);
    };
    const placeNormally = (menu: HTMLElement, anchor: DOMRect, viewport: Size): MenuPlacement => {
      menu.style.width = matchButtonWidth ? `${root.current?.getBoundingClientRect().width}px` : '';
      return placeMenu(anchor, naturalSize(menu), viewport, preference);
    };
    let frame = 0;
    const schedulePlace = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    const observer = new ResizeObserver(schedulePlace);
    observer.observe(menu);
    window.addEventListener('resize', schedulePlace);
    window.addEventListener('scroll', schedulePlace, true);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedulePlace);
      window.removeEventListener('scroll', schedulePlace, true);
    };
  }, [open, placement, align, matchButtonWidth, flyoutBesideSidebar]);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!root.current?.contains(target) && !popup.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', out);
    popup.current?.querySelector<HTMLElement>('[role=menuitem]:not([aria-disabled=true])')?.focus();
    return () => document.removeEventListener('mousedown', out);
  }, [open]);
  const move = (e: React.KeyboardEvent) => {
    const list = [...(popup.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      // Focus goes back to the button first, so Tab continues from where the menu was opened.
      close();
    }
  };
  return (
    <span
      className={`menu-button ${className}`.trim()}
      ref={root}
      onKeyDown={open ? move : undefined}
    >
      <button
        ref={button}
        className={buttonClassName}
        aria-label={ariaLabel}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => {
          if (!open && e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {icon}
        {label}
      </button>
      {open &&
        createPortal(
          <div ref={popup} role="menu" aria-label={menuLabel ?? ariaLabel} className="menu-popup">
            {header}
            {items.map(it => (
              <button
                key={it.label}
                role="menuitem"
                tabIndex={-1}
                aria-disabled={it.disabled ? true : undefined}
                aria-description={it.disabled || undefined}
                title={it.disabled || it.hint || undefined}
                onClick={() => {
                  if (it.disabled) return;
                  setOpen(false);
                  button.current?.focus();
                  it.run();
                }}
              >
                {it.icon}
                <span>
                  {it.label}
                  {it.detail && <small>{it.detail}</small>}
                  {it.disabled && <small>{it.disabled}</small>}
                </span>
              </button>
            ))}
          </div>,
          menuHost(button.current),
        )}
    </span>
  );
}
