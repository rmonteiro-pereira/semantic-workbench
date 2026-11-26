// Checks the synthetic next-base schemas differ from the pinned ontology schema in exactly the ways they claim.
import { expect, test } from 'bun:test';
import pinned from '../../schemas/ossie-ontology-0.2.0.dev0.json';
import synthetic from '../fixtures/ossie-next-base/synthetic-ontology.json';
import colliding from '../fixtures/ossie-next-base/colliding-ontology.json';

test('the synthetic base differs from the pinned schema only in version, id and title', () => {
  const { $id: pinnedId, title: pinnedTitle, ...pinnedRest } = pinned;
  const { $id: syntheticId, title: syntheticTitle, ...syntheticRest } = structuredClone(synthetic);
  expect(syntheticId).not.toBe(pinnedId);
  expect(syntheticTitle).not.toBe(pinnedTitle);
  expect(syntheticRest.properties.version.const).toBe('0.4.0.dev0');
  syntheticRest.properties.version.const = pinnedRest.properties.version.const;
  expect(syntheticRest).toEqual(pinnedRest as typeof syntheticRest);
});

test('the colliding base adds one property that starts with the Tessera prefix', () => {
  const added = Object.keys(colliding.$defs.OntologyComponent.properties).filter(name => !(name in pinned.$defs.OntologyComponent.properties));
  expect(added).toEqual(['tessera_flag']);
});
