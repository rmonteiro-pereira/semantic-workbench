// Checks that paging a compiled file never loses or repeats a byte, never cuts a character and refuses a read that does not name the commit it was shown.
import { expect, test } from 'bun:test';
import { OutputPartError, readOutputPart, type PartSource } from '../../src/server/tessera/output-part';

const encoder = new TextEncoder();
const commit = 'a'.repeat(40);

function sourceOf(text: string): PartSource {
  return { commit, path: 'retail/ontology.yaml', version: 'v1', bytes: encoder.encode(text) };
}

function walk(source: PartSource, limit: number): string {
  let text = '';
  let offset: number | null = 0;
  while (offset !== null) {
    const part = readOutputPart(source, { commit, offset }, limit);
    text += part.text;
    offset = part.nextOffset;
  }
  return text;
}

test('an exact multiple of the limit ends with no further part', () => {
  const source = sourceOf('abcdefgh');
  const first = readOutputPart(source, { commit, offset: 0 }, 4);
  expect(first).toMatchObject({ text: 'abcd', nextOffset: 4, version: 'v1' });
  expect(readOutputPart(source, { commit, offset: 4 }, 4)).toMatchObject({ text: 'efgh', nextOffset: null });
});

test('a multi-byte character at a boundary moves to the next part whole', () => {
  const source = sourceOf('abécd');
  const first = readOutputPart(source, { commit, offset: 0 }, 3);
  expect(first.text).toBe('ab');
  expect(first.nextOffset).toBe(2);
  expect(walk(source, 3)).toBe('abécd');
});

test('a full walk returns every byte without truncation for several limits', () => {
  const text = 'name: café\n'.repeat(50) + '\u{1F600}'.repeat(10);
  for (const limit of [5, 7, 64, 1000]) expect(walk(sourceOf(text), limit)).toBe(text);
});

test('an offset at the end is an empty last part, and one past the end is refused', () => {
  const source = sourceOf('abc');
  expect(readOutputPart(source, { commit, offset: 3 })).toMatchObject({ text: '', nextOffset: null });
  expect(() => readOutputPart(source, { commit, offset: 4 })).toThrow(OutputPartError);
});

test('an offset inside a character is refused', () => {
  expect(() => readOutputPart(sourceOf('é'), { commit, offset: 1 })).toThrow('inside a character');
});

test('a commit that differs is a changed snapshot, and a missing commit is refused', () => {
  const source = sourceOf('abc');
  expect(() => readOutputPart(source, { commit: 'b'.repeat(40), offset: 0 })).toThrow('changed');
  expect(() => readOutputPart(source, { commit: undefined, offset: 0 })).toThrow('needs the commit');
});
