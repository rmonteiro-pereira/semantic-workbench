/** Derives lineage keys from the same structured items used by the inspector. */
import { addressesOfModel } from '../../shared/core/model-addresses';
import { formatAddress, type Address } from '../../shared/core/item-address';
import type { ItemKind } from '../../shared/core/address-kinds';
import { flattenProperties } from './odcs-diff';
import type { ProjectFile } from './lineage';

/** Indexes card names and row labels without treating dotted labels as item paths. */
export function lineageAddresses(files: ProjectFile[], contractPath: string) {
  const cards = new Map<string, string>();
  const rows = new Map<string, string | null>();
  const definitions = new WeakMap<object, string>();
  const cardKey = (file: string, kind: ItemKind, scope: string, name: string) => JSON.stringify([file, kind, scope, name]);
  const rowKey = (card: string, label: string) => JSON.stringify([card, label]);
  const addRow = (card: string, label: string, address: string) => {
    const key = rowKey(card, label);
    rows.set(key, rows.has(key) ? null : address);
  };
  for (const file of files) {
    if (!file.data || typeof file.data !== 'object') continue;
    const model = file.path === contractPath ? { ...file.data, kind: 'DataContract' } : file.data;
    const locate = (chain: Address['chain']) =>
      formatAddress({
        grammar: 1,
        form: file.project ? 'absolute' : 'project-relative',
        ...(file.project ? { project: file.project } : {}),
        document: file.path.split('/'),
        chain,
      });
    for (const item of addressesOfModel(model)) {
      const value = item.path.reduce((parent, part) => parent[part], model);
      const address = locate(item.address.chain);
      if (value && typeof value === 'object') definitions.set(value, address);
      const name = String(value?.name);
      if (['object', 'dataset', 'metric'].includes(item.kind)) {
        const scope =
          item.kind === 'object'
            ? ''
            : item.path
                .slice(0, -2)
                .join('/')
                .replace(/\/semantic_model$/, '');
        cards.set(cardKey(file.path, item.kind, scope, name), address);
      }
      if (item.kind === 'field') addRow(locate(item.address.chain.slice(0, -1)), name, address);
    }
    for (const schemaObject of Array.isArray(model.schema) ? model.schema : []) {
      const card = definitions.get(schemaObject);
      if (!card) continue;
      for (const flat of flattenProperties(schemaObject.properties)) {
        const address = definitions.get(flat.property);
        if (address) addRow(card, flat.path, address);
      }
    }
  }
  return {
    item(file: string, kind: ItemKind, scope: string, name: string): string {
      return cards.get(cardKey(file, kind, scope, name)) ?? `unresolved-lineage:${cardKey(file, kind, scope, name)}`;
    },
    column(card: string, label: string): string {
      return rows.get(rowKey(card, label)) ?? `unresolved-lineage-row:${rowKey(card, label)}`;
    },
    property(value: object): string {
      const address = definitions.get(value);
      if (!address) throw new Error('Lineage property is absent from its structured definition.');
      return address;
    },
  };
}
