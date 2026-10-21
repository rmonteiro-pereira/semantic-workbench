import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
// A menu button (ui-contracts "Header and status"): `aria-haspopup="menu"`, items as menuitems;
// arrows move between items, Escape or a click outside closes it and focus returns to the button.
// A disabled item stays listed with its reason (aria-description and title).
export type MenuItem = {
  label: string;
  run: () => void;
  icon?: React.ReactNode;
  disabled?: string | false;
  hint?: string;
};
export function MenuButton({
  label,
  ariaLabel,
  icon,
  items,
  className = '',
  buttonClassName = '',
  align = 'end',
  title,
}: {
  label?: React.ReactNode;
  ariaLabel: string;
  icon?: React.ReactNode;
  items: MenuItem[];
  className?: string;
  buttonClassName?: string;
  align?: 'start' | 'end';
  title?: string;
}) {
  const [open, setOpen] = useState(false),
    root = useRef<HTMLSpanElement>(null),
    button = useRef<HTMLButtonElement>(null);
  const close = (focus = true) => {
    setOpen(false);
    if (focus) button.current?.focus();
  };
  // Keep the preferred button alignment, shifting only when it would leave the viewport.
  useLayoutEffect(() => {
    if (!open) return;
    const menu = root.current?.querySelector<HTMLElement>('[role=menu]');
    if (!menu) return;
    const fit = () => {
      menu.style.transform = '';
      const box = menu.getBoundingClientRect(),
        edge = 12;
      const shift = Math.max(
        edge - box.left,
        Math.min(0, document.documentElement.clientWidth - edge - box.right),
      );
      menu.style.transform = `translateX(${shift}px)`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(menu);
    if (root.current) observer.observe(root.current);
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', out);
    root.current?.querySelector<HTMLElement>('[role=menuitem]:not([aria-disabled=true])')?.focus();
    return () => document.removeEventListener('mousedown', out);
  }, [open]);
  const move = (e: React.KeyboardEvent) => {
    const list = [...(root.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
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
    } else if (e.key === 'Tab') setOpen(false);
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
      {open && (
        <div role="menu" aria-label={ariaLabel} className={`menu-popup align-${align}`}>
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
                {it.disabled && <small>{it.disabled}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
