/** Defines the versioned address kinds and their permitted model parents. */
import type { ItemKind as EditableItemKind } from '../edit/item-model';

/** Describes how an item is named and where it may occur. */
export type AddressKindRule = {
  parents: readonly string[];
  nameField: string | null;
  named: boolean | 'when-present';
};

/** Closed kind registry for the sw1 grammar. */
export const addressKinds = {
  ontology: { parents: ['root'], nameField: 'name', named: true },
  model: { parents: ['root', 'mapping'], nameField: 'name', named: true },
  mapping: { parents: ['root', 'ontology'], nameField: 'name', named: 'when-present' },
  contract: { parents: ['root'], nameField: 'id', named: true },
  concept: { parents: ['ontology'], nameField: 'concept', named: true },
  relationship: { parents: ['concept'], nameField: 'name', named: true },
  role: { parents: ['relationship'], nameField: null, named: false },
  'concept-mapping': { parents: ['mapping'], nameField: 'concept', named: true },
  'object-mapping': { parents: ['concept-mapping'], nameField: null, named: false },
  'link-mapping': { parents: ['concept-mapping'], nameField: null, named: false },
  dataset: { parents: ['model'], nameField: 'name', named: true },
  field: { parents: ['dataset'], nameField: 'name', named: true },
  join: { parents: ['model'], nameField: 'name', named: true },
  metric: { parents: ['model'], nameField: 'name', named: true },
  object: { parents: ['contract'], nameField: 'name', named: true },
  property: { parents: ['object', 'property'], nameField: 'name', named: true },
  'foreign-key': { parents: ['contract'], nameField: null, named: false },
} as const satisfies Record<string, AddressKindRule>;

/** Names an item kind in the sw1 registry. */
export type ItemKind = keyof typeof addressKinds;

/** Maps structured editor kinds to their address kind without changing editor labels. */
export const editableAddressKinds = {
  concept: 'concept',
  'ontology-relationship': 'relationship',
  dataset: 'dataset',
  field: 'field',
  join: 'join',
  metric: 'metric',
  'odcs-object': 'object',
  'odcs-property': 'property',
  'odcs-foreign-key': 'foreign-key',
  'concept-mapping': 'concept-mapping',
} as const satisfies Record<EditableItemKind, ItemKind>;
