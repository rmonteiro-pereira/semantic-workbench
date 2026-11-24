// Checks that a loss is released only for the exact digest or a policy that allows every dropped property, and that a failed compile is never acceptable.
import { expect, test } from 'bun:test';
import { decideAcceptance, isPolicyError, readInlinePolicy } from '../../src/server/tessera/accept-loss';
import { compileUnit } from '../../src/shared/tessera/compile-unit';
import { ONTOLOGY_TEXT } from '../helpers/tessera-repository';

const encoder = new TextEncoder();
const withLoss = compileUnit([{ path: 'retail/ontology.yaml', bytes: encoder.encode(ONTOLOGY_TEXT) }], { lossPolicySha256: null });
const withoutLoss = compileUnit([{ path: 'retail/plain.yaml', bytes: encoder.encode('version: 0.2.0.dev0\nname: plain\nontology: []\n') }], { lossPolicySha256: null });
const aFailure = [{ code: 'meaning' as const, message: 'The meaning changed.' }];

test('the fixture drops values, so the tests below mean something', () => {
  expect(withLoss.failures).toEqual([]);
  expect(withLoss.report.losses.length).toBeGreaterThan(0);
});

test('a matching digest accepts the loss by digest', () => {
  expect(decideAcceptance(withLoss.report, [], { digest: withLoss.report.digest })).toEqual({ decision: 'accepted', accepted: 'digest' });
});

test('a stale digest asks for acceptance again and names both digests', () => {
  const decision = decideAcceptance(withLoss.report, [], { digest: 'sha256:' + '0'.repeat(64) });
  expect(decision.decision).toBe('needs-acceptance');
  expect(JSON.stringify(decision)).toContain(withLoss.report.digest);
});

test('a policy that allows every dropped property accepts by policy', () => {
  const policy = readInlinePolicy({ policy: 1, allow: Object.keys(withLoss.report.counts) });
  expect(decideAcceptance(withLoss.report, [], { policy })).toEqual({ decision: 'accepted', accepted: 'policy' });
});

test('a policy that misses one dropped property does not accept', () => {
  const policy = readInlinePolicy({ policy: 1, allow: [] });
  expect(decideAcceptance(withLoss.report, [], { policy }).decision).toBe('needs-acceptance');
});

test('a failure is refused even with the exact digest', () => {
  expect(decideAcceptance(withLoss.report, aFailure, { digest: withLoss.report.digest })).toEqual({ decision: 'refused' });
});

test('an empty report needs no acceptance', () => {
  expect(withoutLoss.report.losses).toEqual([]);
  expect(decideAcceptance(withoutLoss.report, [], {})).toEqual({ decision: 'accepted', accepted: 'none' });
});

test('an unusable inline policy is reported as a policy error', () => {
  expect(() => readInlinePolicy({ policy: 2, allow: [] })).toThrow();
  try {
    readInlinePolicy({ policy: 1, allow: ['not_registered'] });
  } catch (error) {
    expect(isPolicyError(error)).toBe(true);
  }
});
