// Tests editor patches that preserve untouched bytes and line endings.
import { test, expect } from 'bun:test';
import { EditorState } from '@codemirror/state';
import {
  applyPatches,
  changesToPatches,
  diffPatches,
  dominantLineBreak,
  lineStarts,
  normalize,
} from '../src/shared/editor/patch';

function edit(
  original: string,
  spec: (doc: string) => { from: number; to?: number; insert?: string }[],
) {
  const state = EditorState.create({ doc: original });
  const tr = state.update({ changes: spec(state.doc.toString()) });
  return applyPatches(original, changesToPatches(original, state.doc, tr.changes));
}
test('CodeMirror normalizes line breaks; the original keeps them', () => {
  expect(EditorState.create({ doc: 'a\r\nb\rc\n' }).doc.toString()).toBe('a\nb\nc\n');
  expect(normalize('a\r\nb\rc')).toBe('a\nb\nc');
  expect(lineStarts('a\r\nb\rc\nd')).toEqual([0, 3, 5, 7]);
});
test('editing one line of a mixed CRLF/LF file changes only that line', () => {
  const original = 'a: 1\r\nb: 2\nc: 3\r\n';
  expect(
    edit(original, d => [{ from: d.indexOf('2'), to: d.indexOf('2') + 1, insert: '20' }]),
  ).toBe('a: 1\r\nb: 20\nc: 3\r\n');
});
test('inserted line breaks use the dominant style; deleting across a CRLF removes both bytes', () => {
  expect(dominantLineBreak('a\r\nb\r\nc\n')).toBe('\r\n');
  expect(dominantLineBreak('a\nb\nc\r\n')).toBe('\n');
  expect(dominantLineBreak('x')).toBe('\n');
  expect(dominantLineBreak('a\rb\rc\n')).toBe('\r');
  expect(edit('a: 1\r\nb: 2\r\n', d => [{ from: d.indexOf('\nb'), insert: '\nz: 9' }])).toBe(
    'a: 1\r\nz: 9\r\nb: 2\r\n',
  );
  expect(edit('a: 1\r\nb: 2\r\n', d => [{ from: d.indexOf('\n'), to: d.indexOf('\n') + 1 }])).toBe(
    'a: 1b: 2\r\n',
  );
});
test('tabs, a missing or present trailing newline and several changes at once are preserved', () => {
  expect(
    edit('\tkey: v\r\n\tother: w', d => [
      { from: d.indexOf('v'), to: d.indexOf('v') + 1, insert: 'V' },
      { from: d.indexOf('w'), to: d.indexOf('w') + 1, insert: 'W' },
    ]),
  ).toBe('\tkey: V\r\n\tother: W');
  expect(edit('x\r\n', d => [{ from: d.length, insert: 'y' }])).toBe('x\r\ny');
  expect(edit('', () => [{ from: 0, insert: 'a\nb' }])).toBe('a\nb');
});
test('a save sends the smallest patch, never splitting CRLF or surrogate pairs', () => {
  expect(diffPatches('same', 'same')).toEqual([]);
  const base = 'a: 1\r\nb: 2\r\nc: 3\r\n';
  const next = 'a: 1\r\nb: 22\r\nc: 3\r\n';
  const p = diffPatches(base, next);
  expect(p).toEqual([{ from: 10, to: 10, insert: '2' }]);
  expect(applyPatches(base, p)).toBe(next);
  for (const [a, b] of [
    ['x\r\ny', 'x\ny'],
    ['x\ny', 'x\r\ny'],
    ['😀a', '😁a'],
    ['ab', 'b'],
    ['a', ''],
  ] as const) {
    const q = diffPatches(a, b);
    expect(applyPatches(a, q)).toBe(b);
    expect(q[0].to - q[0].from).toBeLessThanOrEqual(a.length);
  }
  expect(() => applyPatches('abc', [{ from: 2, to: 1, insert: '' }])).toThrow();
});
