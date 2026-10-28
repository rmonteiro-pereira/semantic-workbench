/** Provides keyboard-accessible menus that return focus to their trigger when closed. */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import React, { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { placeMenu, type MenuPlacement, type MenuPreference, type Size } from './menu-position';
import { popupNaturalSize, useAnchoredPopup, usePopupDismiss } from './useAnchoredPopup';
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
  /** Draws a divider above this item, to start a new group. */
  separatorBefore?: boolean;
  /** Replaces the list with these items, under a Back row, instead of running something. */
  submenu?: MenuItem[];
};
/** Draws the menu inside the open dialog that holds its button, which hides the rest of the page. */
function menuHost(button: HTMLElement | null): HTMLElement {
  return button?.closest<HTMLElement>('dialog[open]') ?? document.body;
}
/** The item that takes focus when a menu or submenu opens. */
const FIRST_ITEM = '[role=menuitem]:not([aria-disabled=true])';

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
  title?: string;
  header?: React.ReactNode;
  menuLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState<MenuItem | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const close = (focus = true) => {
    setOpen(false);
    if (focus) button.current?.focus();
  };
  // The menu is drawn in the window, not inside the panel that holds its button, so a scrolling or
  // masked list cannot clip or fade it. It follows the button and flips when there is no room.
  // Swapping in a submenu places it again before the browser paints.
  function placePopup(menu: HTMLElement, anchor: DOMRect, viewport: Size): MenuPlacement {
    menu.style.width = matchButtonWidth ? `${root.current?.getBoundingClientRect().width}px` : '';
    const preference: MenuPreference = { side: placement, align };
    return placeMenu(anchor, popupNaturalSize(menu), viewport, preference);
  }
  useAnchoredPopup(open, { popup, anchor: button }, placePopup, [
    openSubmenu,
    placement,
    align,
    matchButtonWidth,
  ]);
  usePopupDismiss(open, { popup, anchor: root }, FIRST_ITEM, () => setOpen(false));
  useEffect(() => {
    if (!open) setOpenSubmenu(null);
  }, [open]);
  // Moving into or out of a submenu swaps the whole list, so focus starts again at its top. Opening
  // the menu is handled above, so this runs only when the submenu changes while it is open.
  const shownSubmenu = useRef<MenuItem | null>(null);
  useEffect(() => {
    if (!open || shownSubmenu.current === openSubmenu) return;
    shownSubmenu.current = openSubmenu;
    popup.current?.querySelector<HTMLElement>(FIRST_ITEM)?.focus();
  }, [open, openSubmenu]);
  const back: MenuItem = {
    label: 'Back',
    icon: <ChevronLeft size={15} />,
    run: () => setOpenSubmenu(null),
  };
  const shownItems = openSubmenu?.submenu ? [back, ...openSubmenu.submenu] : items;
  const choose = (item: MenuItem) => {
    if (item.disabled) return;
    if (item.submenu) {
      setOpenSubmenu(item);
      return;
    }
    if (item === back) {
      back.run();
      return;
    }
    setOpen(false);
    button.current?.focus();
    item.run();
  };
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
          <div
            ref={popup}
            role="menu"
            aria-label={openSubmenu?.label ?? menuLabel ?? ariaLabel}
            className="menu-popup"
          >
            {header}
            {shownItems.map(it => (
              <Fragment key={it.label}>
                {it.separatorBefore && <div role="separator" />}
                <button
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={it.disabled ? true : undefined}
                  aria-description={it.disabled || undefined}
                  aria-haspopup={it.submenu ? 'menu' : undefined}
                  title={it.disabled || it.hint || undefined}
                  onClick={() => choose(it)}
                >
                  {it.icon}
                  <span>
                    {it.label}
                    {it.detail && <small>{it.detail}</small>}
                    {it.disabled && <small>{it.disabled}</small>}
                  </span>
                  {it.submenu && <ChevronRight size={15} className="menu-submenu-arrow" />}
                </button>
              </Fragment>
            ))}
          </div>,
          menuHost(button.current),
        )}
    </span>
  );
}
