/** Runs the portable grammar contract against a candidate module. */
import assert from 'node:assert/strict';
import fixtures from '../tests/fixtures/addresses/conformance.json';
import type * as Grammar from '../src/shared/core/item-address';

/** Checks candidate behavior without relying on its private implementation. */
export function addressGrammarCase(candidate: typeof Grammar) {
  for (const entry of [...fixtures.valid, ...fixtures.hostile]) {
    assert.deepEqual(candidate.parseAddress(entry.text), { ok: true, address: entry.parsed });
    assert.equal(candidate.formatAddress(entry.parsed as Grammar.Address), entry.canonical);
  }
  for (const entry of fixtures.invalid) assert.deepEqual(candidate.parseAddress(entry.text), { ok: false, reason: entry.reason });
  const boundary = 'sw1:' + 'p'.repeat(4092);
  assert.equal(candidate.parseAddress(boundary).ok, true);
  assert.deepEqual(candidate.parseAddress(boundary + 'p'), { ok: false, reason: 'length' });
  const fullChain = 'sw1:p/a#' + Array.from({ length: 32 }, () => 'concept:x').join('/');
  assert.equal(candidate.parseAddress(fullChain).ok, true);
  const from = candidate.parseAddress('sw1:p/a#concept:Customer');
  const other = candidate.parseAddress('sw1:p/a#concept:CustomerGroup');
  assert(from.ok && other.ok);
  assert.equal(candidate.hasPrefix(other.address, from.address), false);
}
