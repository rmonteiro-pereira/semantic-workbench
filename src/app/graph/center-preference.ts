/** Preserves the previous canvas preference before installing a stable item address. */
import { parseAddress } from '../../shared/core/item-address';

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Writes a stable locator only after verifying an exact backup of the previous value. */
export function saveCenterPreference(storage: PreferenceStorage, key: string, address: string): boolean {
  const parsed = parseAddress(address);
  if (!parsed.ok || parsed.address.chain.some(segment => 'position' in segment)) return false;
  const previous = storage.getItem(key);
  if (previous === address) return true;
  const backupKey = key + ':before-item-addresses';
  if (previous !== null && storage.getItem(backupKey) === null) {
    storage.setItem(backupKey, previous);
    if (storage.getItem(backupKey) !== previous) throw new Error('The saved canvas preference backup could not be verified.');
  }
  storage.setItem(key, address);
  if (storage.getItem(key) === address) return true;
  if (previous === null) storage.removeItem(key);
  else storage.setItem(key, previous);
  throw new Error('The canvas preference could not be saved.');
}
