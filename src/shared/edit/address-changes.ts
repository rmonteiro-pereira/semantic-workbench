/** Derives explicit rename declarations from workbench edits without changing source notation. */
import { parseDocument } from 'yaml';
import { addressesOfModel, absoluteItemAddress, type AddressDocument, type AddressedItem } from '../core/model-addresses';
import { formatAddress, replacePrefix, parseAddress } from '../core/item-address';
import type { DeclaredMigration } from '../core/address-migration';
import { rdfSyntax } from '../validation/rdf';

const scopes = new Set(['ontology', 'mapping', 'model', 'contract']);

function stable(item: AddressedItem): boolean {
  return !item.volatile && !item.ambiguous;
}

function parsedModel(source: string) {
  const document = parseDocument(source);
  if (document.errors.length) return null;
  return document.toJS({ maxAliasCount: 100 });
}

function normalizedFrom(item: AddressedItem, location: AddressDocument, declarations: DeclaredMigration[]): string {
  let address = absoluteItemAddress(item.address, location);
  for (const declaration of declarations) {
    const from = parseAddress(declaration.from);
    const to = parseAddress(declaration.to);
    if (from.ok && to.ok) address = replacePrefix(address, from.address, to.address);
  }
  return formatAddress(address);
}

/** Declares named scope changes and, when supplied, the edited item's subtree rename. */
export function declaredRenames(before: string, after: string, location: AddressDocument, itemPath?: readonly (string | number)[]): DeclaredMigration[] {
  const filename = location.document.join('/');
  if (rdfSyntax(before, filename) || rdfSyntax(after, filename) || filename.endsWith('.gitignore')) return [];
  const previous = addressesOfModel(parsedModel(before));
  const next = addressesOfModel(parsedModel(after));
  const nextPaths = new Map(next.map(item => [JSON.stringify(item.path), item]));
  const oldKeys = new Set(previous.map(item => formatAddress(item.address)));
  const nextKeys = new Set(next.map(item => formatAddress(item.address)));
  const declarations: DeclaredMigration[] = [];
  for (const item of previous) {
    const scope = scopes.has(item.kind);
    if (!scope && JSON.stringify(item.path) !== JSON.stringify(itemPath)) continue;
    const target = nextPaths.get(JSON.stringify(item.path));
    if (!target || target.kind !== item.kind || !stable(item) || !stable(target)) continue;
    const oldKey = formatAddress(item.address);
    const nextKey = formatAddress(target.address);
    if (oldKey === nextKey || nextKeys.has(oldKey) || oldKeys.has(nextKey)) continue;
    const from = normalizedFrom(item, location, declarations);
    const to = formatAddress(absoluteItemAddress(target.address, location));
    if (from !== to) declarations.push({ kind: scope ? 'scope' : 'item', from, to });
  }
  return declarations;
}

/** Lists minimal stable prefixes removed by an explicit workbench delete operation. */
export function deletedItemAddresses(before: string, after: string, location: AddressDocument): string[] {
  const filename = location.document.join('/');
  if (rdfSyntax(before, filename) || rdfSyntax(after, filename)) return [];
  const previous = addressesOfModel(parsedModel(before), location);
  const next = new Set(addressesOfModel(parsedModel(after), location).map(item => formatAddress(item.address)));
  const removed = previous.filter(item => stable(item) && !next.has(formatAddress(item.address)));
  const keys = new Set(removed.map(item => formatAddress(item.address)));
  return removed
    .filter(item => {
      for (let length = 1; length < item.address.chain.length; length++) {
        if (keys.has(formatAddress({ ...item.address, chain: item.address.chain.slice(0, length) }))) return false;
      }
      return true;
    })
    .map(item => formatAddress(item.address));
}
