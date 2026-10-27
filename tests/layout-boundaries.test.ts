// The three runtime areas of src/ import in one direction only, as ARCHITECTURE.md describes:
// shared code runs on both sides, so it may not reach into the browser app or the server.
import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const SOURCE_FILE = /\.(ts|tsx|js)$/;
const RELATIVE_IMPORT = /^\s*(import|export)\s+(type\s+)?[^'"]*?['"](\.{1,2}\/[^'"]+)['"]/gm;
// `import('../x').Type` names a type inline; it crosses areas just like a statement does.
const INLINE_TYPE_IMPORT = /import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

type SourceImport = { importer: string; area: string; typeOnly: boolean };

function filesUnder(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter(name => SOURCE_FILE.test(name))
    .map(name => join(folder, name));
}

/** The area of src/ (app, server, shared, generated) each relative import of `folder` lands in. */
function importsOf(folder: string): SourceImport[] {
  const found: SourceImport[] = [];
  for (const importer of filesUnder(folder)) {
    const source = readFileSync(importer, 'utf8');
    const areaOf = (specifier: string) =>
      relative('src', resolve(dirname(importer), specifier)).split('/')[0];
    for (const match of source.matchAll(RELATIVE_IMPORT)) {
      found.push({ importer, area: areaOf(match[3]), typeOnly: Boolean(match[2]) });
    }
    for (const match of source.matchAll(INLINE_TYPE_IMPORT)) {
      found.push({ importer, area: areaOf(match[1]), typeOnly: true });
    }
  }
  return found;
}

function importLines(imports: SourceImport[]): string[] {
  return imports.map(item => `${item.importer} -> src/${item.area}`);
}

test('shared code imports only shared and generated code', () => {
  const outside = importsOf('src/shared').filter(
    item => item.area !== 'shared' && item.area !== 'generated',
  );
  expect(importLines(outside)).toEqual([]);
});

test('the server never imports the browser app', () => {
  const browser = importsOf('src/server').filter(item => item.area === 'app');
  expect(importLines(browser)).toEqual([]);
});

test('the browser app takes only types from the server', () => {
  const values = importsOf('src/app').filter(item => item.area === 'server' && !item.typeOnly);
  expect(importLines(values)).toEqual([]);
});
