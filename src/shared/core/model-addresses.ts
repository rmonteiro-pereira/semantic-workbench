/** Derives locators from structured definitions without reading files or changing their values. */
import { addressKinds, type ItemKind } from './address-kinds';
import { formatAddress, resolveAddress, type Address, type ItemSegment } from './item-address';
import { expandIri, prefixMap } from '../validation/iri';

/** Locates one structured item and describes its stability and ambiguity. */
export type AddressedItem = {
  address: Address;
  kind: ItemKind;
  path: (string | number)[];
  volatile: boolean;
  ambiguous: boolean;
};
/** Distinguishes one match, duplicate matches and an absent item. */
export type Resolution = { status: 'found'; item: AddressedItem } | { status: 'ambiguous'; items: AddressedItem[] } | { status: 'missing' };
/** Supplies a document location when deriving absolute locators outside the inspector. */
export type AddressDocument = { project: string; document: string[] };
/** Reports an item whose locator exceeds the grammar bounds. */
export class UnaddressableItemError extends Error {
  constructor(
    readonly path: (string | number)[],
    cause: unknown,
  ) {
    super(`Unaddressable item at ${JSON.stringify(path)}`, { cause });
  }
}

function segmentOf(kind: ItemKind, value: any, index: number): ItemSegment {
  const rule = addressKinds[kind];
  const name = rule.nameField === null ? undefined : value?.[rule.nameField];
  if (!rule.named || typeof name !== 'string' || !name.length || !name.isWellFormed()) return { kind, position: index };
  return { kind, name };
}

/** Lists every structured item in document order, including unnamed and nested children. */
export function addressesOfModel(model: any, document?: AddressDocument): AddressedItem[] {
  const items: AddressedItem[] = [];
  const texts: string[] = [];
  const counts = new Map<string, number>();
  const base: Address = document ? { grammar: 1, form: 'absolute', project: document.project, document: document.document, chain: [] } : { grammar: 1, form: 'document-relative', chain: [] };
  const visit = (value: any, kind: ItemKind, path: (string | number)[], ancestors: ItemSegment[], index = 0) => {
    const chain = [...ancestors, segmentOf(kind, value, index)];
    const address = { ...base, chain };
    let text: string;
    try {
      text = formatAddress(address);
    } catch (error) {
      throw new UnaddressableItemError(path, error);
    }
    texts.push(text);
    counts.set(text, (counts.get(text) ?? 0) + 1);
    items.push({ address, kind, path, volatile: chain.some(segment => 'position' in segment), ambiguous: false });
    const children = (key: string, childKind: ItemKind) => {
      const values = value?.[key];
      if (!Array.isArray(values)) return;
      values.forEach((child, childIndex) => visit(child, childKind, [...path, key, childIndex], chain, childIndex));
    };
    visitChildren(value, kind, path, chain, children, visit);
  };
  visitRoots(model, visit);
  return items.map((item, index) => ({ ...item, ambiguous: counts.get(texts[index])! > 1 }));
}

const childLists: Partial<Record<ItemKind, [string, ItemKind][]>> = {
  ontology: [
    ['ontology', 'concept'],
    ['ontology_mappings', 'mapping'],
  ],
  concept: [['relationships', 'relationship']],
  relationship: [['roles', 'role']],
  mapping: [['concept_mappings', 'concept-mapping']],
  'concept-mapping': [
    ['object_mappings', 'object-mapping'],
    ['link_mappings', 'link-mapping'],
  ],
  model: [
    ['datasets', 'dataset'],
    ['relationships', 'join'],
    ['metrics', 'metric'],
  ],
  dataset: [['fields', 'field']],
  contract: [['schema', 'object']],
  object: [['properties', 'property']],
  property: [['properties', 'property']],
};

type Visit = (value: any, kind: ItemKind, path: (string | number)[], chain: ItemSegment[], index?: number) => void;

function visitRoots(model: any, visit: Visit) {
  if (model?.kind === 'DataContract') visit(model, 'contract', [], []);
  else if (Array.isArray(model?.ontology)) visit(model, 'ontology', [], []);
  else if (Array.isArray(model?.concept_mappings)) visit(model, 'mapping', [], []);
  else if (Array.isArray(model?.semantic_model)) model.semantic_model.forEach((entry: any, index: number) => visit(entry, 'model', ['semantic_model', index], [], index));
  else if (Array.isArray(model?.datasets)) visit(model, 'model', [], []);
}

function visitChildren(value: any, kind: ItemKind, path: (string | number)[], chain: ItemSegment[], children: (key: string, kind: ItemKind) => void, visit: Visit) {
  for (const [key, childKind] of childLists[kind] ?? []) children(key, childKind);
  if (kind === 'mapping' && value?.semantic_model) visit(value.semantic_model, 'model', [...path, 'semantic_model'], chain);
  if (kind === 'property' && value?.items && typeof value.items === 'object' && !Array.isArray(value.items)) {
    const position = Array.isArray(value.properties) ? value.properties.length : 0;
    visit(value.items, 'property', [...path, 'items'], chain, position);
  }
  if (kind === 'contract') visitForeignKeys(value, chain, visit);
}

function visitForeignKeys(contract: any, chain: ItemSegment[], visit: Visit) {
  let position = 0;
  const scan = (value: any, path: (string | number)[]) => {
    if (!value || typeof value !== 'object') return;
    const foreignKeys = Array.isArray(value.relationships) ? value.relationships : [];
    foreignKeys.forEach((foreignKey: any, index: number) => visit(foreignKey, 'foreign-key', [...path, 'relationships', index], chain, position++));
    if (value.items && typeof value.items === 'object') scan(value.items, [...path, 'items']);
    for (const key of ['schema', 'properties']) {
      if (Array.isArray(value[key])) value[key].forEach((entry: any, index: number) => scan(entry, [...path, key, index]));
    }
  };
  scan(contract, []);
}

function validParents(address: Address): boolean {
  return address.chain.every((segment, index) => {
    const parents: readonly string[] = addressKinds[segment.kind].parents;
    return parents.includes(index === 0 ? 'root' : address.chain[index - 1].kind);
  });
}

function matchesSegment(value: any, kind: ItemKind, index: number, wanted: ItemSegment | undefined): boolean {
  if (!wanted || wanted.kind !== kind) return false;
  const actual = segmentOf(kind, value, index);
  if ('name' in wanted) return 'name' in actual && wanted.name === actual.name;
  return 'position' in actual && wanted.position === actual.position;
}

/** Resolves only exact kind-qualified chains, returning all duplicate matches. */
export function resolveInModel(model: any, address: Address, document?: AddressDocument): Resolution {
  if (!validParents(address)) return { status: 'missing' };
  if (address.form === 'absolute' && document && (address.project !== document.project || JSON.stringify(address.document) !== JSON.stringify(document.document))) return { status: 'missing' };
  const matches: AddressedItem[] = [];
  const walk: Visit = (value, kind, path, ancestors, index = 0) => {
    if (!matchesSegment(value, kind, index, address.chain[ancestors.length])) return;
    const chain = [...ancestors, segmentOf(kind, value, index)];
    if (chain.length === address.chain.length) {
      matches.push({ address, kind, path, volatile: chain.some(entry => 'position' in entry), ambiguous: false });
      return;
    }
    const children = (key: string, childKind: ItemKind) => {
      if (!Array.isArray(value?.[key])) return;
      value[key].forEach((child: any, childIndex: number) => {
        if (!matchesSegment(child, childKind, childIndex, address.chain[chain.length])) return;
        walk(child, childKind, [...path, key, childIndex], chain, childIndex);
      });
    };
    visitChildren(value, kind, path, chain, children, walk);
  };
  visitRoots(model, walk);
  if (matches.length > 1) return { status: 'ambiguous', items: matches.map(item => ({ ...item, ambiguous: true })) };
  if (matches.length === 1) return { status: 'found', item: matches[0] };
  return { status: 'missing' };
}

/** Returns only an item's declared, expanded IRI; names never imply identity. */
export function itemIdentity(item: any, document: any): { iri: string } | null {
  if (typeof item?.iri !== 'string' || !item.iri) return null;
  const expanded = expandIri(item.iri, prefixMap(document?.prefixes));
  return 'iri' in expanded ? { iri: expanded.iri } : null;
}

/** Makes a document-relative item locator absolute using a known document location. */
export function absoluteItemAddress(address: Address, document: AddressDocument): Address {
  const result = resolveAddress(address, { grammar: 1, form: 'absolute', project: document.project, document: document.document, chain: [] });
  if (!result.ok) throw new Error(`Cannot resolve item address: ${result.reason}`);
  return result.address;
}

/** Derives one inspected item's locator without enumerating unrelated fields and children. */
export function addressAtModelPath(model: any, path: (string | number)[]): Address {
  let value = model;
  let kind: ItemKind = 'model';
  let offset = 0;
  if (model.kind === 'DataContract') kind = 'contract';
  else if (Array.isArray(model.ontology)) kind = 'ontology';
  else if (Array.isArray(model.concept_mappings)) kind = 'mapping';
  else if (Array.isArray(model.semantic_model)) {
    if (path[0] !== 'semantic_model' || typeof path[1] !== 'number') throw new UnaddressableItemError(path, 'Missing model scope');
    value = model.semantic_model[path[1]];
    offset = 2;
  }
  const rootIndex = offset === 2 ? Number(path[1]) : 0;
  const chain: ItemSegment[] = [segmentOf(kind, value, rootIndex)];
  while (offset < path.length) {
    const key = path[offset];
    if (kind === 'property' && key === 'items') {
      const position = Array.isArray(value.properties) ? value.properties.length : 0;
      value = value.items;
      chain.push(segmentOf('property', value, position));
      offset++;
      continue;
    }
    if (kind === 'mapping' && key === 'semantic_model') {
      kind = 'model';
      value = value.semantic_model;
      offset++;
      chain.push(segmentOf(kind, value, 0));
      continue;
    }
    const childKind: ItemKind | undefined = childLists[kind]?.find(([list]) => list === key)?.[1];
    const index = path[offset + 1];
    if (!childKind || typeof index !== 'number') {
      const foreignKey = foreignKeyAddressAtPath(model, path);
      if (foreignKey) {
        formatAddress(foreignKey);
        return foreignKey;
      }
      throw new UnaddressableItemError(path, 'Unknown item path');
    }
    value = value[key][index];
    kind = childKind;
    chain.push(segmentOf(kind, value, index));
    offset += 2;
  }
  const address: Address = { grammar: 1, form: 'document-relative', chain };
  formatAddress(address);
  return address;
}

function foreignKeyAddressAtPath(model: any, path: (string | number)[]): Address | undefined {
  if (model.kind !== 'DataContract') return undefined;
  const wanted = JSON.stringify(path);
  let address: Address | undefined;
  visitForeignKeys(model, [segmentOf('contract', model, 0)], (_value, _kind, candidate, chain, position = 0) => {
    if (JSON.stringify(candidate) === wanted) address = { grammar: 1, form: 'document-relative', chain: [...chain, { kind: 'foreign-key', position }] };
  });
  return address;
}
