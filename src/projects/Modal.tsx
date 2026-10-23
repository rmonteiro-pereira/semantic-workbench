/** Provides modal focus handling and keeps dialog actions visible below scrolling content. */
import React, { useEffect, useRef } from 'react';
// The background is inert, Tab stays inside, and closing restores focus. Every dialog has one of
// two widths (narrow for a short form or question, wide for a list, table or editor), the same
// padding, and a footer that stays visible below the scrolling body.
//
// Footer rule: the dismissing button comes first and the main action last, on the right. It says
// Cancel when closing abandons a choice or discards input, Close when the dialog only shows
// information or keeps its choices, and Done when its controls already apply as they change. A Back button sits at the
// left through a dialog-footer-spacer. When the main action is off, footerNote says why.
/** Sent on the window when a dialog opens, so a phone's workspace drawer can close behind it. */
export const DIALOG_OPENED_EVENT = 'workbench:dialog-opened';
/** Sent on the window after a dialog closed and gave focus back. */
export const DIALOG_CLOSED_EVENT = 'workbench:dialog-closed';
/** Selects the dialog's width preset. */
export type ModalSize = 'narrow' | 'wide';
/** Renders a modal with contained focus, a scrolling body and persistent actions. */
export function Modal({
  title,
  onCancel,
  children,
  className = '',
  size = 'narrow',
  footer,
  footerNote,
  describedBy,
}: {
  title: string;
  onCancel: () => void;
  children: React.ReactNode;
  className?: string;
  size?: ModalSize;
  footer: React.ReactNode;
  /** Why the main action in the footer is off, shown beside the buttons. */
  footerNote?: string;
  describedBy?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useRef('dialog-' + Math.random().toString(36).slice(2)).current;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    window.dispatchEvent(new Event(DIALOG_OPENED_EVENT));
    return () => {
      dialog.current?.close();
      previous?.focus();
      window.dispatchEvent(new Event(DIALOG_CLOSED_EVENT));
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
  // React passes a nested dialog's cancel event on to the dialogs around it, so Escape in a
  // dialog opened from another dialog would otherwise close both.
  const cancelThisDialog = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    onCancel();
  };
  return (
    <dialog
      ref={dialog}
      className="validation-backdrop"
      aria-labelledby={id}
      aria-describedby={describedBy}
      aria-modal="true"
      onCancel={cancelThisDialog}
      onKeyDown={trap}
    >
      <section className={`workbench-dialog has-footer size-${size} ${className}`.trim()}>
        <h2 id={id}>{title}</h2>
        <div className="dialog-body">{children}</div>
        <footer className="dialog-footer">
          {footerNote && <p className="dialog-footer-note">{footerNote}</p>}
          {footer}
        </footer>
      </section>
    </dialog>
  );
}
