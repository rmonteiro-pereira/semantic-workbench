/** Verifies dependency locks are read strictly and checked against current import declarations. */
import { expect, test } from 'bun:test';
import { manifestIsCurrent, parseDependencyManifest, printDependencyManifest, type DependencyManifest } from '../../src/shared/tessera/dependency-manifest';
import type { UnitImport } from '../../src/shared/tessera/imports';

const commit = '1'.repeat(40);
const interfaceHash = 'sha256:' + '2'.repeat(64);
const manifest: DependencyManifest = {
  manifestVersion: 1,
  root: 'ontology.yaml',
  providers: [
    { project: 'finance', ontology: 'public.yaml', repository: 'fin', sameRepository: false, commit, choice: 'pin', tag: 'stable', interfaceHash, concepts: ['Order', 'Amount'], dependsOn: [] },
    { project: 'units', ontology: 'ontology.yaml', repository: 'retail', sameRepository: true, tag: null, choice: 'latest', interfaceHash, concepts: ['Currency'], dependsOn: [] },
  ],
};
const imports: UnitImport[] = [
  { project: 'finance', ontology: 'public.yaml', alias: 'fin', concepts: ['Amount', 'Order'], version: { pin: 'stable' } },
  { project: 'units', alias: 'units', concepts: ['Currency'], version: 'latest' },
];

test('accepts the supported manifest shape and rejects a commit on an atomic dependency', () => {
  expect(parseDependencyManifest(JSON.stringify(manifest))).toEqual(manifest);
  const invalid = { ...manifest, providers: [manifest.providers[0], { ...manifest.providers[1], commit }] };
  expect(() => parseDependencyManifest(JSON.stringify(invalid))).toThrow('supported format');
  expect(() => parseDependencyManifest(JSON.stringify({ ...manifest, providers: [manifest.providers[0], { ...manifest.providers[0], tag: null }] }))).toThrow('supported format');
  expect(() => parseDependencyManifest('providers: []')).toThrow('valid JSON');
});

test('canonical locks have sorted keys and stable arrays of providers and concepts', () => {
  const bytes = printDependencyManifest(manifest);
  const sorted = parseDependencyManifest(bytes);
  expect(bytes).toStartWith('{\n  "manifestVersion": 1,\n  "providers":');
  expect(bytes.endsWith('\n')).toBe(true);
  expect(sorted.providers[0].concepts).toEqual(['Amount', 'Order']);
  expect(printDependencyManifest({ providers: [...manifest.providers].reverse(), root: manifest.root, manifestVersion: 1 })).toBe(bytes);
  expect(printDependencyManifest(sorted)).toBe(bytes);
});

test('current locks match the chosen ontology, version and exact allow-list', () => {
  expect(manifestIsCurrent(manifest, imports)).toBe(true);
  for (const change of [{ concepts: ['Order'] }, { version: 'latest' as const }, { version: { pin: commit } }, { ontology: 'other.yaml' }]) {
    expect(manifestIsCurrent(manifest, [{ ...imports[0], ...change }, imports[1]])).toBe(false);
  }
  expect(manifestIsCurrent(manifest, [imports[0]])).toBe(false);
});
