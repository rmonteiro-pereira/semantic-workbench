// Proves side parsing without consulting Git or the filesystem.
import { expect, test } from 'bun:test';
import { createSideRegistry, parseSide } from '../../src/shared/item-diff/sides';

test('parses published, saved working files, a branch and a full commit', () => {
  expect(parseSide('published')).toEqual({ name: 'published', text: 'published' });
  expect(parseSide('working')).toEqual({ name: 'working', text: 'working' });
  expect(parseSide('branch:work/finance')).toMatchObject({ name: 'branch', reference: 'work/finance' });
  expect(parseSide('commit:' + 'a'.repeat(40))).toMatchObject({ name: 'commit', reference: 'a'.repeat(40) });
});

test('refuses unknown, abbreviated and malformed sides with the supported names', () => {
  for (const text of ['draft', 'commit:abc123', 'branch:', 'branch:work/../main', 'published:main', 'branch:work.lock', 'branch:-main', 'branch:a@{b}']) {
    expect(() => parseSide(text)).toThrow(/published, working, branch:/);
  }
});

test('an extra side registers in its own registry', () => {
  const registry = createSideRegistry();
  registry.register({ name: 'review', named: true, accepts: value => /^[a-z]+$/.test(value) });
  expect(registry.parse('review:finance')).toMatchObject({ name: 'review', reference: 'finance' });
  expect(() => parseSide('review:finance')).toThrow();
  expect(() => registry.register({ name: 'working', named: false, accepts: () => true })).toThrow();
});
