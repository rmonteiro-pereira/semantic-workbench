// Tests how saved rename declarations are matched to the exact bytes of a commit.
import { expect, test } from 'bun:test';
import { committedFileEdits, completeCommittedEdits } from '../src/server/projects/address-commit';
import type { JournalMigration } from '../src/server/projects/address-migrations';
import { sha256 } from '../src/server/projects/atomic';

const path = 'sales.yaml';
const bytes = (text: string) => new TextEncoder().encode(text);
const hash = (text: string) => sha256(bytes(text));

type SaveShape = { before: string | null; after: string; otherFiles?: string[] };

/** One declaration from a save that changed `path` from `before` to `after`. */
function declaration(id: string, saveId: string, { before, after, otherFiles = [] }: SaveShape): JournalMigration {
  const files = [{ path, before: before === null ? null : hash(before), after: hash(after) }];
  for (const other of otherFiles) {
    files.push({ path: other, before: hash('old ' + other), after: hash('new ' + other) });
  }
  return {
    id,
    kind: 'item',
    from: `sw1:shop/${path}#model:Sales/metric:${id}-from`,
    to: `sw1:shop/${path}#model:Sales/metric:${id}-to`,
    at: '2026-11-18T10:00:00.000Z',
    commit: 'base',
    saved: { id: saveId, directory: '/work', branch: 'main', files },
  };
}

const ids = (records: readonly JournalMigration[]) => records.map(record => record.id);

test('a single save between the two commits matches', () => {
  const rename = declaration('a', 'save-1', { before: 'v0', after: 'v1' });
  expect(ids(committedFileEdits(path, bytes('v0'), bytes('v1'), [rename]))).toEqual(['a']);
});

test('a chain of saves matches only when it reaches the previous commit with no gap', () => {
  const first = declaration('a', 'save-1', { before: 'v0', after: 'v1' });
  const second = declaration('b', 'save-2', { before: 'v1', after: 'v2' });
  expect(ids(committedFileEdits(path, bytes('v0'), bytes('v2'), [first, second]))).toEqual(['a', 'b']);

  const gapped = declaration('b', 'save-2', { before: 'v1b', after: 'v2' });
  expect(committedFileEdits(path, bytes('v0'), bytes('v2'), [first, gapped])).toEqual([]);
});

test('bytes that differ from the last save match nothing', () => {
  const rename = declaration('a', 'save-1', { before: 'v0', after: 'v1' });
  expect(committedFileEdits(path, bytes('v0'), bytes('edited after saving'), [rename])).toEqual([]);
});

test('a rename and its revert both match and stay in order', () => {
  const rename = declaration('a', 'save-1', { before: 'v0', after: 'v1' });
  const revert = declaration('b', 'save-2', { before: 'v1', after: 'v2' });
  expect(ids(committedFileEdits(path, bytes('v0'), bytes('v2'), [rename, revert]))).toEqual(['a', 'b']);
});

test('a commit whose bytes equal the previous commit binds nothing', () => {
  const rename = declaration('a', 'save-1', { before: 'v0', after: 'v0' });
  expect(committedFileEdits(path, bytes('v0'), bytes('v0'), [rename])).toEqual([]);
});

test('several declarations of one save all match through that save', () => {
  const first = declaration('a', 'save-1', { before: 'v0', after: 'v1' });
  const second = declaration('b', 'save-1', { before: 'v0', after: 'v1' });
  expect(ids(committedFileEdits(path, bytes('v0'), bytes('v1'), [first, second]))).toEqual(['a', 'b']);
});

test('a save is bound only when every one of its files matched', () => {
  const twoFiles = declaration('a', 'save-1', { before: 'v0', after: 'v1', otherFiles: ['orders.yaml'] });
  const onlyThisFile = committedFileEdits(path, bytes('v0'), bytes('v1'), [twoFiles]);
  expect(completeCommittedEdits([twoFiles], [onlyThisFile])).toEqual([]);
  expect(ids(completeCommittedEdits([twoFiles], [onlyThisFile, [twoFiles]]))).toEqual(['a']);
});
