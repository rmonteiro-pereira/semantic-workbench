import { test, expect } from 'bun:test';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  atomicWrite,
  atomicWriteJson,
  decode,
  encode,
  readJsonFile,
  sha256,
  TEMP_SUFFIX,
} from '../server/projects/atomic';
import { tempDataDir } from './helpers/temp-data-dir';
test('SHA-256 of bytes and of the UTF-8 text agree', () => {
  expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(sha256(encode('é\r\n'))).toBe(sha256(Buffer.from('é\r\n', 'utf8')));
});
test('atomic write replaces the file through a temporary file and returns the new hash', () => {
  const d = tempDataDir();
  try {
    const file = join(d.root, 'nested', 'a.yaml');
    expect(atomicWrite(file, 'a: 1\r\n')).toBe(sha256('a: 1\r\n'));
    expect(readFileSync(file, 'utf8')).toBe('a: 1\r\n');
    let seen = '';
    atomicWrite(file, 'a: 2\n', {
      beforeRename: temp => {
        seen = temp;
        expect(readFileSync(file, 'utf8')).toBe('a: 1\r\n');
        expect(readFileSync(temp, 'utf8')).toBe('a: 2\n');
      },
    });
    expect(seen.endsWith(TEMP_SUFFIX)).toBe(true);
    expect(seen).not.toBe(file);
    expect(readFileSync(file, 'utf8')).toBe('a: 2\n');
    expect(readdirSync(join(d.root, 'nested'))).toEqual(['a.yaml']);
  } finally {
    d.cleanup();
  }
});
test('a crash between writing and renaming keeps the original bytes', () => {
  const d = tempDataDir();
  try {
    const file = join(d.root, 'b.ttl');
    writeFileSync(file, 'original\n');
    expect(() =>
      atomicWrite(file, 'replacement that never lands\n', {
        beforeRename: () => {
          throw Error('simulated crash');
        },
      }),
    ).toThrow('simulated crash');
    expect(readFileSync(file, 'utf8')).toBe('original\n');
  } finally {
    d.cleanup();
  }
});
test('decode keeps a byte order mark and rejects invalid UTF-8', () => {
  expect(decode(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]))).toBe('\ufeffa');
  expect(encode(decode(new Uint8Array([0xef, 0xbb, 0xbf, 0x61])))).toEqual(
    new Uint8Array([0xef, 0xbb, 0xbf, 0x61]),
  );
  expect(() => decode(new Uint8Array([0xff, 0xfe, 0x00]))).toThrow('UTF-8');
});
test('JSON state helpers round-trip and report missing files as null', () => {
  const d = tempDataDir();
  try {
    const file = join(d.root, 's.json');
    expect(readJsonFile(file)).toBeNull();
    atomicWriteJson(file, { formatVersion: 1, x: [1] });
    expect(readJsonFile(file)).toEqual({ formatVersion: 1, x: [1] });
  } finally {
    d.cleanup();
  }
});
