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
  ontology: { parents: ['root'], nameField: 'name', named: 'when-present' },
  model: { parents: ['root', 'mapping'], nameField: 'name', named: 'when-present' },
  mapping: { parents: ['root', 'ontology'], nameField: 'name', named: 'when-present' },
  contract: { parents: ['root'], nameField: 'id', named: 'when-present' },
  concept: { parents: ['ontology'], nameField: 'concept', named: 'when-present' },
  relationship: { parents: ['concept'], nameField: 'name', named: 'when-present' },
  role: { parents: ['relationship'], nameField: null, named: false },
  'concept-mapping': { parents: ['mapping'], nameField: 'concept', named: 'when-present' },
  'object-mapping': { parents: ['concept-mapping'], nameField: null, named: false },
  'link-mapping': { parents: ['concept-mapping'], nameField: null, named: false },
  dataset: { parents: ['model'], nameField: 'name', named: 'when-present' },
  field: { parents: ['dataset'], nameField: 'name', named: 'when-present' },
  join: { parents: ['model'], nameField: 'name', named: 'when-present' },
  metric: { parents: ['model', 'dataset'], nameField: 'name', named: 'when-present' },
  object: { parents: ['contract'], nameField: 'name', named: 'when-present' },
  property: { parents: ['object', 'property'], nameField: 'name', named: 'when-present' },
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
