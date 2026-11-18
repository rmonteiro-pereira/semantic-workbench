// Proves the compiler is a pure function: the same project gives the same bytes in any file order and from any folder, matches the golden bundle, keeps item addresses and round-trips as stated.
import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';
import { formatAddress, type Address } from '../../src/shared/core/item-address';
import { inspect } from '../../src/shared/core/model';
import { compileUnit, type CompileResult, type UnitFile } from '../../src/shared/tessera/compile-unit';
import { sha256Hex } from '../../src/shared/tessera/digest';
import { COMPILER_VERSION } from '../../src/shared/tessera/format';
import { printReport } from '../../src/shared/tessera/loss-report';
import { seededRandom, shuffled } from '../helpers/seeded-random';
import { COMMITTED_FILES, ONTOLOGY_TEXT, PROJECT_FOLDER } from '../helpers/tessera-repository';

const goldenFolder = join(import.meta.dir, '../fixtures/tessera/golden');
const options = { lossPolicySha256: null };
const encoder = new TextEncoder();
const projectTexts = Object.entries(COMMITTED_FILES)
  .filter(([path]) => path.startsWith(PROJECT_FOLDER))
  .map(([path, text]) => [path.slice(PROJECT_FOLDER.length + 1), text] as const);

function filesFrom(folder: string): UnitFile[] {
  return readdirSync(folder).map(name => ({ path: name, bytes: new Uint8Array(readFileSync(join(folder, name))) }));
}

function writeProject(): string {
  const folder = mkdtempSync(join(tmpdir(), 'tessera-determinism-'));
  for (const [path, text] of projectTexts) writeFileSync(join(folder, path), text);
  return folder;
}

function fingerprint(result: CompileResult): string {
  const outputs = result.outputs.map(output => `${output.path} ${sha256Hex(output.bytes)}`);
  return [...outputs, printReport(result.report)].join('\n');
}

test('a hundred compiles in shuffled order from different folders give identical bytes', () => {
  const random = seededRandom(4242);
  const fingerprints = new Set<string>();
  for (let round = 0; round < 100; round++) {
    const folder = writeProject();
    const result = compileUnit(shuffled(filesFrom(folder), random), options);
    rmSync(folder, { recursive: true, force: true });
    expect(result.failures).toEqual([]);
    fingerprints.add(fingerprint(result));
  }
  expect(fingerprints.size).toBe(1);
});

function goldenFiles(result: CompileResult): Record<string, string> {
  const files: Record<string, string> = { 'loss-report.json': printReport(result.report) };
  for (const output of result.outputs) files[output.path] = new TextDecoder().decode(output.bytes);
  return files;
}

test(`the output equals the golden bundle for compiler version ${COMPILER_VERSION}`, () => {
  const result = compileUnit(
    projectTexts.map(([path, text]) => ({ path, bytes: encoder.encode(text) })),
    options,
  );
  const actual = goldenFiles(result);
  if (process.env.UPDATE_TESSERA_GOLDEN) {
    for (const [path, text] of Object.entries(actual)) {
      mkdirSync(dirname(join(goldenFolder, path)), { recursive: true });
      writeFileSync(join(goldenFolder, path), text);
    }
  }
  const golden = Object.fromEntries(readdirSync(goldenFolder).map(name => [name, readFileSync(join(goldenFolder, name), 'utf8')]));
  expect(actual).toEqual(golden);
  expect(golden['loss-report.json']).toContain(`"version": "${COMPILER_VERSION}"`);
});

test('every item of the fixture ontology keeps its document-relative address and name', () => {
  const compiled = compileUnit(
    projectTexts.map(([path, text]) => ({ path, bytes: encoder.encode(text) })),
    options,
  );
  const compiledText = new TextDecoder().decode(compiled.outputs.find(output => output.path === 'ontology.yaml')!.bytes);
  const items = (text: string) =>
    [...inspect(text, 'ontology.yaml').entities, ...inspect(text, 'ontology.yaml').edges].map(item => ('address' in item ? `${formatAddress(item.address as Address)}` : `${item.id}`));
  expect(items(compiledText)).toEqual(items(ONTOLOGY_TEXT));
  expect(items(ONTOLOGY_TEXT).length).toBeGreaterThan(2);
});

function compileOne(path: string, text: string) {
  const result = compileUnit([{ path, bytes: encoder.encode(text) }], options);
  expect(result.failures).toEqual([]);
  return { result, text: new TextDecoder().decode(result.outputs[0].bytes) };
}

test('adding the marker to a standard ontology and compiling returns the same data', () => {
  const standard = readFileSync('public/examples/ossie/flights.ontology.yaml', 'utf8');
  const { text } = compileOne('flights.ontology.yaml', `tessera: 1\n${standard}`);
  expect(parse(text)).toEqual(parse(standard));
});

test('compiling a Tessera document and adding the marker again gives the source data without its additions', () => {
  const { text } = compileOne('retail.ontology.yaml', ONTOLOGY_TEXT);
  const again = parse(`tessera: 1\n${text}`);
  expect(again.tessera).toBe(1);
  const expected = parse(ONTOLOGY_TEXT);
  delete expected.tessera_notes;
  for (const concept of expected.ontology) {
    delete concept.tessera_notes;
    for (const relationship of concept.relationships ?? []) delete relationship.tessera_notes;
  }
  expect(again).toEqual({ ...expected, tessera: 1 });
});
