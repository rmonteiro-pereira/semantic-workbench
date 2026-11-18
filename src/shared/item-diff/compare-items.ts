// Pairs items only by canonical address and explicit ordered migration records.
import { deletesAddress, migrateAddress, type MigrationRecord } from '../core/address-migration';
import { formatAddress, parseAddress } from '../core/item-address';
import { fieldChanges } from './field-changes';
import type { DiffItem, ItemChange } from './item-change';

function byAddress(items: readonly DiffItem[]): Map<string, DiffItem[]> {
  const index = new Map<string, DiffItem[]>();
  for (const item of items) index.set(item.address, [...(index.get(item.address) ?? []), item]);
  return index;
}

function migratedTarget(item: DiffItem, records: readonly MigrationRecord[]): string | null {
  const parsed = parseAddress(item.address);
  if (!parsed.ok) throw new Error(`Invalid comparison item address: ${parsed.reason}.`);
  let address = parsed.address;
  const applied = new Set<string>();
  for (const record of records) {
    if (applied.has(record.id)) continue;
    applied.add(record.id);
    if (deletesAddress(record, address)) return null;
    address = migrateAddress(address, [record], false);
  }
  return formatAddress(address);
}

function changeOf(item: DiffItem, state: ItemChange['state'], ambiguous = 0): ItemChange {
  return { kind: item.kind, state, address: item.address, name: item.name, ambiguous, fields: [] };
}

function textOrder(left: string, right: string): number {
  if (left < right) return -1;
  return Number(left > right);
}

/** Compares addressed items with no name matching or similarity inference. */
export function compareItems(before: readonly DiffItem[], after: readonly DiffItem[], records: readonly MigrationRecord[] = []): ItemChange[] {
  const oldItems = byAddress(before);
  const newItems = byAddress(after);
  const changes: { path: string; change: ItemChange }[] = [];
  const matched = new Set<string>();
  const ambiguous = new Set([...oldItems.keys(), ...newItems.keys()].filter(address => Math.max(oldItems.get(address)?.length ?? 0, newItems.get(address)?.length ?? 0) > 1));
  for (const address of ambiguous) {
    const candidates = [...(newItems.get(address) ?? []), ...(oldItems.get(address) ?? [])].sort((left, right) => textOrder(left.name, right.name));
    const item = candidates[0];
    const count = Math.max(oldItems.get(address)?.length ?? 0, newItems.get(address)?.length ?? 0);
    changes.push({ path: item.path, change: changeOf(item, 'changed', count) });
  }
  const targets = new Map<string, string | null>();
  const claims = new Map<string, number>();
  for (const [address, items] of oldItems) {
    if (ambiguous.has(address)) continue;
    const target = newItems.has(address) ? address : migratedTarget(items[0], records);
    targets.set(address, target);
    if (target) claims.set(target, (claims.get(target) ?? 0) + 1);
  }
  for (const [address, items] of oldItems) {
    if (ambiguous.has(address)) continue;
    const previous = items[0];
    const target = targets.get(address);
    const current = target && !ambiguous.has(target) && claims.get(target) === 1 ? newItems.get(target)?.[0] : undefined;
    if (!current) {
      changes.push({ path: previous.path, change: changeOf(previous, 'removed') });
      continue;
    }
    matched.add(current.address);
    const fields = fieldChanges(previous.data, current.data);
    if (!fields.length && address === current.address && previous.kind === current.kind) continue;
    const change = { ...changeOf(current, 'changed'), fields };
    if (address !== current.address) change.previousAddress = address;
    changes.push({ path: current.path, change });
  }
  for (const [address, items] of newItems) {
    if (!matched.has(address) && !ambiguous.has(address)) changes.push({ path: items[0].path, change: changeOf(items[0], 'added') });
  }
  return changes
    .sort((left, right) => textOrder(left.path, right.path) || textOrder(left.change.kind, right.change.kind) || textOrder(left.change.address, right.change.address))
    .map(entry => entry.change);
}
