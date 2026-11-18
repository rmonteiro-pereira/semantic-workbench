import type { ItemChange } from '../../shared/item-diff/item-change';
import { Modal } from '../projects/Modal';
import { ChangeMark } from './ChangeMark';

/** Shows the identity of a removed published item selected in a graph or list. */
export function RemovedItemReview({ change, onClose }: { change: ItemChange; onClose: () => void }) {
  return (
    <Modal
      title={change.name}
      onCancel={onClose}
      footer={
        <button type="button" onClick={onClose}>
          Close
        </button>
      }
    >
      <section className="item-change-list">
        <ChangeMark change="removed" />
        <p>The published {change.kind.replaceAll('-', ' ')} is absent from this branch.</p>
        <p>{change.address}</p>
      </section>
    </Modal>
  );
}
