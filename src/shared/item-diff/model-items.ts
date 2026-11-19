// Derives comparison inputs from the same model and address registry used by the inspector.
import { conceptKindLookup, isAttribute, type ConceptShape } from '../attributes/attribute-rule';
import { addressKinds } from '../core/address-kinds';
import { formatAddress } from '../core/item-address';
import { addressesOfModel } from '../core/model-addresses';
import { InputError } from '../validation/diagnostics';
import type { DiffItem } from './item-change';

const childFields: Record<string, string[]> = {
  ontology: ['ontology', 'ontology_mappings'],
  concept: ['relationships'],
  model: ['datasets', 'relationships', 'metrics'],
  dataset: ['fields'],
  mapping: ['concept_mappings', 'semantic_model'],
  'concept-mapping': ['object_mappings', 'link_mappings'],
  contract: ['schema'],
  object: ['properties'],
  property: ['properties', 'items'],
};

/** Produces one input per address, keeping additions on their owner and attributes as relationships. */
export function itemsOfModel(model: Record<string, unknown>, project: string, path: string): DiffItem[] {
  const concepts = (Array.isArray(model.ontology) ? model.ontology : []) as ConceptShape[];
  const lookup = conceptKindLookup(concepts);
  return addressesOfModel(model, { project, document: path.split('/') }).map(item => {
    let value: any = model;
    for (const segment of item.path) value = value[segment];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new InputError([{ severity: 'error', code: 'structure', path: '/' + item.path.join('/'), message: 'Expected an item object.' }]);
    }
    const data: Record<string, unknown> = { ...value };
    for (const key of childFields[item.kind] ?? []) delete data[key];
    // A format marker chooses validation; it is not an item property.
    if (item.path.length === 0) delete data.tessera;
    const nameField = addressKinds[item.kind].nameField;
    const rawName = nameField === null ? undefined : data[nameField];
    return {
      address: formatAddress(item.address),
      path,
      kind: item.kind === 'relationship' && isAttribute(value, lookup) ? 'attribute' : item.kind,
      name: typeof rawName === 'string' ? rawName : `${item.kind} at ${item.path.join('/') || '/'}`,
      data,
    };
  });
}
