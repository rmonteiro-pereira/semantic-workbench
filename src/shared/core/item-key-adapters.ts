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

/** Encodes a stable lineage center in the previous UI store format during staged adoption. */
export function legacyLineageKey(address: Address, path?: readonly (string | number)[]): string | null {
  if (!address.document || address.chain.some(segment => 'position' in segment)) return null;
  const ownerIndex = address.chain.findIndex(segment => ['object', 'dataset', 'metric'].includes(segment.kind));
  const owner = address.chain[ownerIndex];
  if (!owner || !('name' in owner)) return null;
  if (owner.kind !== 'object' && address.chain.slice(0, ownerIndex).some(segment => segment.kind === 'mapping') && !path) return null;
  const scope = path
    ? path
        .slice(0, -2)
        .join('/')
        .replace(/\/semantic_model$/, '')
    : '';
  const ownerName = owner.kind === 'object' ? owner.name : scope + '/' + owner.name;
  const suffix = address.chain
    .slice(ownerIndex + 1)
    .map(segment => ('name' in segment ? segment.name : ''))
    .join('.');
  return `${owner.kind}:${address.document.join('/')}#${ownerName}${suffix ? '/' + suffix : ''}`;
}

/** Preserves the former key of a mapping card that has no structured locator. */
export function legacyMappingCardKey(kind: 'concept' | 'dataset' | 'metric', name: string): string {
  return `${kind}:${name}`;
}

/** Encodes a stable mapping card in the previous UI store format during staged adoption. */
export function legacyMappingKey(address: Address): string | null {
  if (address.chain.some(segment => 'position' in segment)) return null;
  const segment = address.chain.at(-1);
  if (!segment || !('name' in segment) || !['concept', 'dataset', 'metric'].includes(segment.kind)) return null;
  return legacyMappingCardKey(segment.kind as 'concept' | 'dataset' | 'metric', segment.name);
}

/** Recognizes the former tuple encoding only against an already resolved field. */
export function matchesLegacyFieldKey(key: string, dataset: string, field: string): boolean {
  return key === JSON.stringify([dataset, field]);
}
