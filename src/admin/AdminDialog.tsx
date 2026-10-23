import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Modal, type ModalSize } from '../projects/Modal';
import { useMe } from '../auth/useMe';
import './admin.css';

/** Shared dialog lifecycle props used by each administration area. */
export type DialogProps = { onClose: () => void };

// The footer element of the nearest admin dialog, so a form deep in the body can put its
// primary action next to Close instead of at the end of a long scrolling body.
const FooterSlot = createContext<HTMLElement | null>(null);

/** Puts its buttons in the footer of the surrounding admin dialog, or inline without one. */
export function DialogActions({
  children,
  inline = false,
}: {
  children: ReactNode;
  /** Keeps the buttons in the body, for a dialog whose footer would hold two forms' actions. */
  inline?: boolean;
}) {
  const slot = useContext(FooterSlot);
  if (inline || !slot) return <div className="admin-actions">{children}</div>;
  return createPortal(children, slot);
}

/** Keeps administrative actions visible and identifies bootstrap access on every save path. */
export function AdminDialog({
  title,
  onClose,
  children,
  size = 'large',
  lastAdminNotice = false,
}: DialogProps & {
  title: string;
  children: ReactNode;
  size?: ModalSize;
  /** Set on the dialogs where a change could remove the last active Admin. */
  lastAdminNotice?: boolean;
}) {
  const { me } = useMe();
  const [footerSlot, setFooterSlot] = useState<HTMLElement | null>(null);
  const bootstrap = me?.roleSources?.some(source => source.via === 'bootstrap');
  return (
    <Modal
      title={title}
      onCancel={onClose}
      size={size}
      className="admin-dialog"
      footer={
        <>
          <span className="admin-footer-actions" ref={setFooterSlot} />
          <button onClick={onClose}>Close</button>
        </>
      }
    >
      <FooterSlot.Provider value={footerSlot}>
        {bootstrap && (
          <p className="admin-notice">
            Bootstrap Admin — emergency access from server configuration.
          </p>
        )}
        {lastAdminNotice && (
          <p className="admin-notice">Changes that remove the last active Admin are refused.</p>
        )}
        {children}
      </FooterSlot.Provider>
    </Modal>
  );
}
