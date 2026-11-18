// Checks the pure rules of a proposal: names, identifiers and the status a record and its refs give.
import { expect, test } from 'bun:test';
import { MAX_ID_LENGTH, deriveId, deriveStatus, isProposalId, validateName, ProposalInputError, type ProposalRecord } from '../src/shared/proposals/proposal';

const record = (overrides: Partial<ProposalRecord> = {}): ProposalRecord => ({
  id: 'p1',
  name: 'First',
  projects: ['sales'],
  base: 'a'.repeat(40),
  createdBy: 'alice',
  createdByName: 'Alice',
  createdAt: '2026-11-17T10:00:00.000Z',
  status: 'open',
  contributors: [],
  ...overrides,
});
const refs = (overrides: Partial<Parameters<typeof deriveStatus>[1]> = {}) => ({ openTip: 'b'.repeat(40), closedTip: null, openTipPublished: false, ...overrides });

test('a name is trimmed and limited to 80 characters without control characters', () => {
  expect(validateName('  Rename customer  ')).toBe('Rename customer');
  expect(validateName('x'.repeat(80))).toHaveLength(80);
  for (const bad of ['', '   ', 'x'.repeat(81), 'line\nbreak', 'tab\there', 42, undefined]) {
    expect(() => validateName(bad), String(bad)).toThrow(ProposalInputError);
  }
});

test('an identifier comes from the name, stays within 40 characters and gets a suffix on a clash', () => {
  expect(deriveId('Rename the Customer concept!', new Set())).toBe('rename-the-customer-concept');
  expect(deriveId('Café déjà vu', new Set())).toBe('cafe-deja-vu');
  expect(deriveId('東京', new Set())).toBe('proposal');
  const long = deriveId('word '.repeat(40), new Set());
  expect(long.length).toBeLessThanOrEqual(MAX_ID_LENGTH);
  expect(isProposalId(long)).toBe(true);
  expect(deriveId('Same', new Set(['same']))).toBe('same-2');
  expect(deriveId('Same', new Set(['same', 'same-2']))).toBe('same-3');
  const clash = deriveId('word '.repeat(40), new Set([long]));
  expect(clash.length).toBeLessThanOrEqual(MAX_ID_LENGTH);
  expect(clash).not.toBe(long);
});

test('identifiers accept lower case letters, digits and dashes only', () => {
  for (const good of ['a', 'p1', 'rename-customer', '9']) expect(isProposalId(good), good).toBe(true);
  for (const bad of ['', '-a', 'A', 'a.b', 'a/b', 'a b', 'x'.repeat(41), 7]) expect(isProposalId(bad), String(bad)).toBe(false);
});

test('status follows the record and the refs', () => {
  expect(deriveStatus(record(), refs())).toBe('open');
  expect(deriveStatus(record({ status: 'closed' }), refs({ openTip: null, closedTip: 'c'.repeat(40) }))).toBe('closed');
  expect(deriveStatus(record({ status: 'promoted' }), refs({ openTip: null }))).toBe('promoted');
  expect(deriveStatus(record(), refs({ openTip: null }))).toBe('damaged');
  expect(deriveStatus(record({ status: 'closed' }), refs({ openTip: null, closedTip: null }))).toBe('damaged');
  expect(deriveStatus(null, refs())).toBe('unregistered');
});

test('an open tip inside the published history is promoted, except a proposal still at its base', () => {
  expect(deriveStatus(record(), refs({ openTipPublished: true }))).toBe('promoted');
  const atBase = record();
  expect(deriveStatus(atBase, refs({ openTip: atBase.base, openTipPublished: true }))).toBe('open');
});
