// Keeps format additions attached to the addressed item that owns them.
import { expect, test } from 'bun:test';
import { inspect } from '../../src/shared/core/model';
import { compareItems } from '../../src/shared/item-diff/compare-items';
import { itemsOfModel } from '../../src/shared/item-diff/model-items';

async function items(source: string) {
  const model = await inspect(source, 'finance.yaml');
  if (!('document' in model)) throw new Error('Expected structured fixture.');
  return itemsOfModel(model.document, 'finance', 'finance.yaml');
}

test('Tessera additions create no address and changes name the owning item field', async () => {
  const source = await Bun.file('tests/fixtures/item-diff/finance.ontology.yaml').text();
  const before = await items(source);
  const after = await items(source.replace('description: A buyer.', 'description: A buyer.\n    tessera_notes: Use the current definition.'));
  expect(after.map(item => item.address)).toEqual(before.map(item => item.address));
  expect(compareItems(before, after)).toMatchObject([{ name: 'Customer', kind: 'concept', fields: [{ field: 'tessera_notes' }] }]);
  expect(await items(source.replace('tessera: 2\n', ''))).toEqual(before);
});

test('attributes keep their own relationship addresses and parent collections do not cascade changes', async () => {
  const source = await Bun.file('tests/fixtures/item-diff/finance.ontology.yaml').text();
  const before = await items(source);
  const attribute = before.find(item => item.name === 'tier');
  expect(attribute?.kind).toBe('attribute');
  expect(attribute?.address).toContain('/relationship:tier');
  const after = await items(source.replace('concept: Tier}', 'concept: String}'));
  const changes = compareItems(before, after);
  expect(changes.map(change => change.kind).sort()).toEqual(['attribute', 'role']);
  expect(changes.find(change => change.kind === 'attribute')?.fields[0].field).toBe('roles');
});
