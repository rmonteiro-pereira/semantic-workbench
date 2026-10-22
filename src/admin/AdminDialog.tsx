import type { ReactNode } from 'react';
import { Modal, type ModalSize } from '../projects/Modal';
import { useMe } from '../auth/useMe';
import './admin.css';

/** Shared dialog lifecycle props used by each administration area. */
export type DialogProps = { onClose: () => void };
/** Keeps administrative actions visible and identifies bootstrap access on every save path. */
export function AdminDialog({
  title,
  onClose,
  children,
  size = 'large',
}: DialogProps & { title: string; children: ReactNode; size?: ModalSize }) {
  const { me } = useMe();
  const bootstrap = me?.roleSources?.some(source => source.via === 'bootstrap');
  return (
    <Modal
      title={title}
      onCancel={onClose}
      size={size}
      className="admin-dialog"
      footer={<button onClick={onClose}>Close</button>}
    >
      {bootstrap && (
        <p className="admin-notice">
          Bootstrap Admin — emergency access from server configuration.
        </p>
      )}
      <p className="admin-notice">Changes that remove the last active Admin are refused.</p>
      {children}
    </Modal>
  );
}
