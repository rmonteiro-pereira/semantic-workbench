import type { ReactNode } from 'react';
import { Modal, type ModalSize } from '../projects/Modal';
import { BootstrapNotice, LastAdminNotice } from './AdminNotices';

/**
 * The one dialog the Admin page uses: a confirmation or a dry-run preview. Everything else
 * is a page or a pane. The footer holds the confirming action beside the cancel button.
 */
export function AdminConfirmation({
  title,
  onCancel,
  actions,
  cancelLabel = 'Cancel',
  size = 'narrow',
  lastAdminNotice = false,
  children,
}: {
  title: string;
  onCancel: () => void;
  /** The buttons that carry out the change; they sit after the cancel button. */
  actions?: ReactNode;
  cancelLabel?: string;
  size?: ModalSize;
  lastAdminNotice?: boolean;
  children: ReactNode;
}) {
  return (
    <Modal
      title={title}
      onCancel={onCancel}
      size={size}
      className="admin-scope"
      footer={
        <>
          <button onClick={onCancel}>{cancelLabel}</button>
          {actions}
        </>
      }
    >
      <BootstrapNotice />
      {lastAdminNotice && <LastAdminNotice />}
      {children}
    </Modal>
  );
}
