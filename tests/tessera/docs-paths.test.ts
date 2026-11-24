// Checks the documents that describe Tessera name only files and finding codes that exist.
import { expect, test } from 'bun:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { EXPECTED_FINDINGS } from '../helpers/tessera-refusals';

const DOCUMENTS = ['README.md', 'ARCHITECTURE.md', 'CHANGELOG.md', 'docs/user-guide.md', 'docs/item-addresses.md', 'docs/agent-runtime.md', 'docs/development.md', 'schemas/README.md'];
const ROOTS = ['src/', 'scripts/', 'tests/', 'schemas/', 'docs/', 'policies/'];
const SEARCHED_FOLDERS = ['src/shared/tessera', 'src/shared/tessera/additions', 'src/server/tessera', 'scripts'];

function codeSpans(text: string): string[] {
  return [...text.matchAll(/`([^`\n]+)`/g)].map(match => match[1]);
}

function tesseraPaths(document: string): string[] {
  const words = codeSpans(readFileSync(document, 'utf8')).flatMap(span => span.split(/\s+/));
  return words.map(word => word.replace(/[,.;:)]+$/, '')).filter(word => ROOTS.some(root => word.startsWith(root)) && /tessera/i.test(word));
}

for (const document of DOCUMENTS) {
  test(`${document} names only Tessera files that exist`, () => {
    for (const path of tesseraPaths(document)) expect(existsSync(path), `${document}: ${path}`).toBe(true);
  });
}

test('the Tessera section of the architecture map names bare file names that exist', () => {
  const text = readFileSync('ARCHITECTURE.md', 'utf8');
  const section = text.slice(text.indexOf('### The Tessera format and compiler'), text.indexOf('### Browser shell and graph rendering'));
  const names = codeSpans(section).filter(span => /^[a-z-]+\.ts$/.test(span));
  expect(names.length).toBeGreaterThan(10);
  for (const name of names)
    expect(
      SEARCHED_FOLDERS.some(folder => existsSync(`${folder}/${name}`)),
      name,
    ).toBe(true);
});

test('every Tessera finding code the guides name is a code the validator gives', () => {
  const known = new Set(Object.values(EXPECTED_FINDINGS).flatMap(findings => findings.map(finding => finding.split(' ')[0])));
  for (const document of DOCUMENTS) {
    const named = codeSpans(readFileSync(document, 'utf8')).filter(span => /^tessera-[a-z]+$/.test(span));
    for (const code of named) expect(known.has(code), `${document}: ${code}`).toBe(true);
  }
});

test('the user guide and the README name every Tessera finding code', () => {
  for (const document of ['README.md', 'docs/user-guide.md']) {
    const text = readFileSync(document, 'utf8');
    for (const code of ['tessera-marker', 'tessera-revision', 'tessera-base', 'tessera-kind', 'tessera-property', 'tessera-location']) expect(text, `${document}: ${code}`).toContain(code);
  }
});

test('the architecture map lists the source folders of the format', () => {
  for (const folder of ['src/shared/tessera', 'src/server/tessera']) expect(readdirSync(folder).length).toBeGreaterThan(0);
});
