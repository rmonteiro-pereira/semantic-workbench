/** Exercises model address decisions against mutation candidates through public functions. */
import assert from 'node:assert/strict';
import type * as ModelAddresses from '../src/shared/core/model-addresses';

/** Detects kind confusion, duplicate selection and lost positional volatility. */
export function modelAddressCase(candidate: typeof ModelAddresses) {
  const duplicate = { name: 'O', ontology: [{ concept: 'C' }, { concept: 'C' }] };
  const matches = candidate.addressesOfModel(duplicate).filter(item => item.kind === 'concept');
  assert.equal(candidate.resolveInModel(duplicate, matches[0].address).status, 'ambiguous');
  const model = { name: 'M', datasets: [{ name: 'same' }], relationships: [{ name: 'same' }] };
  const dataset = candidate.addressesOfModel(model).find(item => item.kind === 'dataset')!;
  const join = candidate.addressesOfModel(model).find(item => item.kind === 'join')!;
  const found = candidate.resolveInModel(model, join.address);
  assert.equal(found.status, 'found');
  if (found.status === 'found') assert.deepEqual(found.item.path, ['relationships', 0]);
  const invalid = { ...dataset.address, chain: [{ kind: 'ontology' as const, name: 'M' }, dataset.address.chain[1]] };
  assert.equal(candidate.resolveInModel(model, invalid).status, 'missing');
  const embedded = { name: 'O', ontology: [], ontology_mappings: [{ semantic_model: { name: 'M', datasets: [{ name: 'D' }] } }] };
  const volatile = candidate.addressesOfModel(embedded).filter(item => item.path[0] === 'ontology_mappings');
  assert(volatile.length >= 3);
  assert(volatile.every(item => item.volatile));
}
