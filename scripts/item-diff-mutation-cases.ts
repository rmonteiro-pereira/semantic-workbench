import assert from 'node:assert/strict';
import { itemDiffBaselineWorkspace } from '../tests/helpers/item-diff-baseline';
import type { DiffItem } from '../src/shared/item-diff/item-change';
import type { MigrationRecord } from '../src/shared/core/address-migration';
import { parseSide } from '../src/shared/item-diff/sides';
import { LOCAL_READER, type Reader } from '../src/server/projects/reader';

const first = 'sw1:finance/model.yaml#ontology:Finance/concept:Customer';
const last = 'sw1:finance/model.yaml#ontology:Finance/concept:Buyer';
const before: DiffItem = { address: first, path: 'model.yaml', kind: 'concept', name: 'Customer', data: { concept: 'Customer' } };
const after: DiffItem = { ...before, address: last, name: 'Buyer', data: { concept: 'Buyer' } };

type Candidate = typeof import('../src/server/projects/item-diff') & typeof import('../src/shared/item-diff/compare-items') & typeof import('../src/server/auth/item-diff-access');

/** Verifies output and access for a normal or deliberately modified comparison module. */
export async function itemDiffMutationCase(category: string, candidate: Candidate) {
  if (category === 'item-diff-selection') {
    using fixture = await itemDiffBaselineWorkspace();
    const result = await candidate.compareProjectItems(fixture.ws.itemDiffSides, 'finance', parseSide('published'), parseSide('working'), LOCAL_READER);
    assert(result.changes.some(change => change.name === 'Customer' && change.state === 'changed'));
  }
  if (category === 'item-diff-address') {
    const changes = candidate.compareItems([before], [after]);
    assert.deepEqual(changes.map(change => change.state).sort(), ['added', 'removed']);
  }
  if (category === 'item-diff-migration') {
    const record: MigrationRecord = { id: 'rename/1', from: first, to: last, kind: 'item', commit: 'rename', at: '2026-01-01T00:00:00.000Z' };
    const [change, extra] = candidate.compareItems([before], [after], [record]);
    assert.equal(change.state, 'changed');
    assert.equal(change.previousAddress, first);
    assert.equal(extra, undefined);
  }
  if (category === 'item-diff-access') {
    const reader = { view: {} } as Reader;
    assert.equal(candidate.diffBranchReadable(reader, 'work/other', 'work/mine'), false);
    assert.equal(candidate.diffBranchReadable(reader, 'work/mine', 'work/mine'), true);
  }
}
