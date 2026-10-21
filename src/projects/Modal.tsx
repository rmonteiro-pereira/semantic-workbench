import React, { useEffect, useRef } from 'react';
// Native modal dialog: the page behind is inert, Tab cycles inside (trap below), Escape cancels, focus returns afterwards.
// v0.3.0 dialog conventions (T012): `size` sets the width (small 420, medium 560 — the default —,
// large 880, full: the whole window less a margin); `footer` holds the dialog's actions, after the
// scrolling body, so they stay visible on long content.
export type ModalSize = 'small' | 'medium' | 'large' | 'full';
export function Modal({
  title,
  onCancel,
  children,
  className = '',
  size = 'medium',
  footer,
  describedBy,
}: {
  title: string;
  onCancel: () => void;
  children: React.ReactNode;
  className?: string;
  size?: ModalSize;
  footer?: React.ReactNode;
  describedBy?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useRef('dialog-' + Math.random().toString(36).slice(2)).current;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      previous?.focus();
    };
  }, []);
  // Escape belongs to this dialog: it must not also close a drawer or menu the dialog sits in.
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const stop = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.stopPropagation();
    };
    d.addEventListener('keydown', stop);
    return () => d.removeEventListener('keydown', stop);
  }, []);
  // Tab cycles inside the dialog instead of leaving it for the browser's own controls.
  const trap = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== 'Tab' || e.defaultPrevented) return;
    const items = [
      ...e.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]),[href],input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),summary,[contenteditable=true],[tabindex]:not([tabindex="-1"])',
      ),
    ].filter(el => el.getClientRects().length > 0 && !el.closest('[inert]'));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !e.currentTarget.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !e.currentTarget.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <dialog
      ref={dialog}
      className="validation-backdrop"
      aria-labelledby={id}
      aria-describedby={describedBy}
      aria-modal="true"
      onCancel={e => {
        e.preventDefault();
        onCancel();
      }}
      onKeyDown={trap}
    >
      <section
        className={`workbench-dialog size-${size}${footer ? ' has-footer' : ''} ${className}`.trim()}
      >
        <h2 id={id}>{title}</h2>
        {footer ? <div className="dialog-body">{children}</div> : children}
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </section>
    </dialog>
  );
}
