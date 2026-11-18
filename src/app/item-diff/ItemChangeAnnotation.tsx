import { formatAddress, type Address } from '../../shared/core/item-address';
import type { Doc } from '../projects/api';
import { ChangeMark } from './ChangeMark';
import { useVisibleItemChanges } from './ItemDiffContext';

/** Qualifies a model-relative address with the saved document it belongs to. */
export function itemAddress(document: Pick<Doc, 'project' | 'path'>, address: Address) {
  return formatAddress({ ...address, form: 'absolute', project: document.project, document: document.path.split('/') });
}

/** Reads the state of one addressed item on the current project overlay. */
export function useItemChange(document: Pick<Doc, 'project' | 'path'> | null, item: { address?: Address } | object) {
  const changes = useVisibleItemChanges();
  if (!document || !('address' in item) || !item.address || !changes.length) return undefined;
  const address = itemAddress(document, item.address as Address);
  return changes.find(change => change.address === address);
}

/** Renders nothing until this item has a visible unpublished change. */
export function ItemChangeAnnotation({ document, item }: { document: Pick<Doc, 'project' | 'path'> | null; item: object }) {
  const change = useItemChange(document, item);
  return <ChangeMark change={change?.state} />;
}
