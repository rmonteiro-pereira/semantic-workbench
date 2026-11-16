/** Reads legacy item labels against a known model without rewriting source text. */
import { addressesOfModel, type AddressDocument, type AddressedItem } from './model-addresses';
import { formatAddress, parseAddress, type Address } from './item-address';

/** Reports an unambiguous converted key or preserves why conversion was impossible. */
export type ItemKeyResult = { status: 'found'; address: Address } | { status: 'missing' | 'ambiguous' | 'qualified' };
/** Resolves a document-local alias before a legacy label is interpreted. */
export type ItemAliasResolver = (name: string) => string | null;

function legacyLabels(item: AddressedItem): string[] {
  const chain = item.address.chain;
  const last = chain.at(-1)!;
  if (!('name' in last)) return [];
  const parent = chain.at(-2);
  const parentName = parent && 'name' in parent ? parent.name : '';
  if (last.kind === 'concept') return [`concept:${last.name}`];
  if (last.kind === 'relationship') return [`concept:${parentName}/${last.name}`];
  if (last.kind === 'dataset') return [`dataset:${last.name}`];
  if (last.kind === 'field') return [`dataset:${parentName}/${last.name}`, `field:${parentName}.${last.name}`, `${parentName}.${last.name}`];
  if (last.kind === 'join') return [`join:${last.name}`];
  if (last.kind === 'metric') return [`metric:${last.name}`];
  return [];
}

/** Converts an old locator only when the loaded definitions give it exactly one meaning. */
export function adaptItemKey(key: string, model: any, document?: AddressDocument, resolveAlias?: ItemAliasResolver): ItemKeyResult {
  const items = addressesOfModel(model, document);
  const canonical = parseAddress(key);
  if (canonical.ok) {
    const text = formatAddress(canonical.address);
    const matches = items.filter(item => formatAddress(item.address) === text);
    return uniqueKey(matches);
  }
  const marker = /^(concept|dataset|field|metric|join):/.exec(key)?.[0] ?? '';
  let value = key.slice(marker.length);
  if (value.includes(':')) {
    if (!resolveAlias) return { status: 'qualified' };
    const resolved = resolveAlias(value);
    if (resolved === null) return { status: 'missing' };
    value = resolved;
  }
  const legacy = marker + value;
  return uniqueKey(items.filter(item => legacyLabels(item).includes(legacy)));
}

function uniqueKey(matches: AddressedItem[]): ItemKeyResult {
  if (matches.length > 1) return { status: 'ambiguous' };
  if (!matches.length) return { status: 'missing' };
  return { status: 'found', address: matches[0].address };
}
