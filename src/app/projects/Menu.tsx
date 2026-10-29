/** Provides keyboard-accessible menus that return focus to their trigger when closed. */
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import React, { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { placeSubmenu, placeMenu, submenuFits, type MenuPlacement, type MenuPreference, type Size } from './menu-position';
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
  /** Makes the item one choice of a set: it is read as a radio item, and a check mark shows the chosen one. */
  checked?: boolean;
  /** Draws a divider above this item, to start a new group. */
  separatorBefore?: boolean;
  /**
   * Opens these items instead of running something: beside the menu when the button asks for it
   * and there is room, otherwise in place of the list under a Back row.
   */
  submenu?: MenuItem[];
};
/** Draws the menu inside the open dialog that holds its button, which hides the rest of the page. */
function menuHost(button: HTMLElement | null): HTMLElement {
  return button?.closest<HTMLElement>('dialog[open]') ?? document.body;
}
/** The item that takes focus when a menu or submenu opens. */
const FIRST_ITEM = '[role^=menuitem]:not([aria-disabled=true])';
const MENU_FOCUS = { firstControl: FIRST_ITEM };
/** The rows of one menu, without the rows of a submenu drawn beside it. */
const OWN_ROWS = ':scope > [role^=menuitem]';

/** The ids that tie a row to the submenu it shows beside the menu. */
type SubmenuIds = { row: string; submenu: string };

type RowProps = {
  item: MenuItem;
  /** Set while this row's submenu is shown beside the menu. */
  openSubmenu?: SubmenuIds;
  onChoose: (item: MenuItem, row: HTMLElement) => void;
  onPoint?: (item: MenuItem, row: HTMLElement) => void;
};

/** One row of a menu: its icon, label, detail or disabled reason, and a submenu arrow. */
function MenuRow({ item, openSubmenu, onChoose, onPoint }: RowProps) {
  return (
    <>
      {item.separatorBefore && <div role="separator" />}
      <button
        role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
        aria-checked={item.checked}
        id={openSubmenu?.row}
        aria-controls={openSubmenu?.submenu}
        tabIndex={-1}
        aria-disabled={item.disabled ? true : undefined}
        aria-description={item.disabled || undefined}
        aria-haspopup={item.submenu ? 'menu' : undefined}
        aria-expanded={item.submenu ? Boolean(openSubmenu) : undefined}
        title={item.disabled || item.hint || undefined}
        onClick={event => onChoose(item, event.currentTarget)}
        onMouseEnter={event => onPoint?.(item, event.currentTarget)}
      >
        {item.checked === undefined ? item.icon : <Check size={16} aria-hidden className={item.checked ? undefined : 'menu-check-hidden'} />}
        <span>
          {item.label}
          {item.detail && <small>{item.detail}</small>}
          {item.disabled && <small>{item.disabled}</small>}
        </span>
        {item.submenu && <ChevronRight size={15} className="menu-submenu-arrow" />}
      </button>
    </>
  );
}

/** Measures the submenu, then places it beside its row. */
function placeSubmenuPopup(menu: HTMLElement, row: DOMRect, viewport: Size): MenuPlacement {
  return placeSubmenu(row, popupNaturalSize(menu), viewport);
}

type SubmenuProps = {
  item: MenuItem;
  ids: SubmenuIds;
  row: RefObject<HTMLElement | null>;
  popup: RefObject<HTMLDivElement | null>;
  host: HTMLElement;
  /** Moves focus into the submenu, as when it was opened from the keyboard or by a click. */
  focusFirst: boolean;
  onChoose: (item: MenuItem, row: HTMLElement) => void;
};

/** Shows a submenu as its own menu beside the row that opened it. */
function SubmenuBeside({ item, ids, row, popup, host, focusFirst, onChoose }: SubmenuProps) {
  useAnchoredPopup(true, { popup, anchor: row }, placeSubmenuPopup, [item]);
  useEffect(() => {
    if (focusFirst) popup.current?.querySelector<HTMLElement>(FIRST_ITEM)?.focus();
  }, [item, focusFirst]);
  return createPortal(
    <div ref={popup} id={ids.submenu} role="menu" aria-labelledby={ids.row} className="menu-popup menu-submenu">
      {item.submenu?.map(entry => (
        <MenuRow key={entry.label} item={entry} onChoose={onChoose} />
      ))}
    </div>,
    host,
  );
}

/** Moves focus for the arrow, Home and End keys, and says whether the key was one of them. */
function moveFocus(rows: HTMLElement[], index: number, key: string): boolean {
  const last = rows.length - 1;
  const targets: Record<string, number> = {
    ArrowDown: index >= last ? 0 : index + 1,
    ArrowUp: index <= 0 ? last : index - 1,
    Home: 0,
    End: last,
  };
  const target = targets[key];
  if (target === undefined) return false;
  rows[target]?.focus();
  return true;
}

/** Tracks the submenu shown beside a menu: which item, the row it opened from, and its popup. */
function useSubmenuBeside(enabled: boolean | undefined, menu: RefObject<HTMLDivElement | null>) {
  const [shown, setShown] = useState<{ item: MenuItem; focus: boolean } | null>(null);
  const row = useRef<HTMLElement | null>(null);
  const popup = useRef<HTMLDivElement>(null);
  const ids: SubmenuIds = { row: useId(), submenu: useId() };

  function fits() {
    const box = menu.current?.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    return enabled === true && box !== undefined && submenuFits(box, viewport);
  }

  function show(item: MenuItem, from: HTMLElement, focus: boolean) {
    row.current = from;
    setShown({ item, focus });
  }

  function hide(returnFocus: boolean) {
    setShown(null);
    if (returnFocus) row.current?.focus();
  }

  // Pointing at a row with a submenu shows it beside the menu; pointing at any other row hides it.
  function point(item: MenuItem, from: HTMLElement) {
    if (!enabled) return;
    if (item.submenu && !item.disabled && fits()) show(item, from, false);
    else if (!item.submenu) hide(false);
  }

  return { shown, ids, row, popup, fits, show, hide, point };
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
  submenuBeside,
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
  /** Opens submenus beside the menu when the window has room for them; a phone never does. */
  submenuBeside?: boolean;
  title?: string;
  header?: React.ReactNode;
  menuLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState<MenuItem | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const beside = useSubmenuBeside(submenuBeside, popup);
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
  useAnchoredPopup(open, { popup, anchor: button }, placePopup, [openSubmenu, placement, align, matchButtonWidth]);
  usePopupDismiss(open, { popup, anchor: root, related: beside.popup }, MENU_FOCUS, () => setOpen(false));
  useEffect(() => {
    if (open) return;
    setOpenSubmenu(null);
    beside.hide(false);
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

  const choose = (item: MenuItem, row?: HTMLElement) => {
    if (item.disabled) return;
    if (item.submenu && row && beside.fits()) {
      beside.show(item, row, true);
      return;
    }
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

  function closeForKey(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      // Focus goes back to the button first, so Tab continues from where the menu was opened.
      close();
    }
  }

  const move = (event: React.KeyboardEvent) => {
    const inSubmenu = beside.popup.current?.contains(document.activeElement) ?? false;
    const menu = inSubmenu ? beside.popup.current : popup.current;
    const rows = [...(menu?.querySelectorAll<HTMLElement>(OWN_ROWS) ?? [])];
    const index = rows.indexOf(document.activeElement as HTMLElement);
    if (moveFocus(rows, index, event.key)) {
      event.preventDefault();
      // Moving to another row of the menu closes a submenu that pointing had opened.
      if (!inSubmenu) beside.hide(false);
      return;
    }
    if (inSubmenu && (event.key === 'Escape' || event.key === 'ArrowLeft')) {
      // Leaving the submenu beside goes back to its row and keeps the menu open.
      event.preventDefault();
      event.stopPropagation();
      beside.hide(true);
      return;
    }
    const rowItem = shownItems[index];
    if (!inSubmenu && event.key === 'ArrowRight' && rowItem?.submenu) {
      event.preventDefault();
      choose(rowItem, rows[index]);
      return;
    }
    closeForKey(event);
  };
  return (
    <span className={`menu-button ${className}`.trim()} ref={root} onKeyDown={open ? move : undefined}>
      <button
        ref={button}
        className={buttonClassName}
        aria-label={ariaLabel}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={event => {
          if (!open && event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {icon}
        {label}
      </button>
      {open &&
        createPortal(
          <div ref={popup} role="menu" aria-label={openSubmenu?.label ?? menuLabel ?? ariaLabel} className="menu-popup">
            {header}
            {shownItems.map(it => (
              <MenuRow key={it.label} item={it} openSubmenu={beside.shown?.item === it ? beside.ids : undefined} onChoose={choose} onPoint={beside.point} />
            ))}
          </div>,
          menuHost(button.current),
        )}
      {open && beside.shown && (
        <SubmenuBeside item={beside.shown.item} ids={beside.ids} row={beside.row} popup={beside.popup} host={menuHost(button.current)} focusFirst={beside.shown.focus} onChoose={choose} />
      )}
    </span>
  );
}
