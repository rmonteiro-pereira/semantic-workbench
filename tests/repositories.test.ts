// Tests how a repository's project folders are read from its manifest or detected from its files.
import { test, expect } from 'bun:test';
import {
  checkProjectFolders,
  detectProjectFolders,
  parseManifest,
} from '../src/server/projects/repositories';

const manifest = (projects: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ schema: 'semantic-workbench/repository/v1', projects, ...extra });

test('a manifest lists project folders with optional names', () => {
  expect(
    parseManifest(
      manifest([{ path: 'domains/sales', name: 'Sales' }, { path: 'domains/finance' }]),
    ),
  ).toEqual([{ path: 'domains/sales', name: 'Sales' }, { path: 'domains/finance' }]);
});

test('manifests with escaping, Git, absolute, nested or repeated folders are refused', () => {
  for (const projects of [
    [{ path: '../outside' }],
    [{ path: 'domains/../../outside' }],
    [{ path: '.git/hooks' }],
    [{ path: 'domains/.git' }],
    [{ path: '/etc' }],
    [{ path: 'C:/data' }],
    [{ path: 'domains/./sales' }],
    [{ path: 'domains\\sales' }],
    [{ path: 'domains' }, { path: 'domains/sales' }],
    [{ path: 'sales' }, { path: 'sales' }],
    [{ path: '' }],
    [],
  ])
    expect(() => parseManifest(manifest(projects)), JSON.stringify(projects)).toThrow();
});

test('a manifest needs its schema and nothing else at the top level', () => {
  expect(() => parseManifest('{')).toThrow('not valid JSON');
  expect(() => parseManifest('[]')).toThrow('must be an object');
  expect(() => parseManifest(JSON.stringify({ projects: [{ path: 'a' }] }))).toThrow('schema');
  expect(() => parseManifest(manifest([{ path: 'a' }], { owner: 'x' }))).toThrow('only');
  expect(() => parseManifest(manifest([{ path: 'a', color: 'red' }]))).toThrow();
  expect(() => parseManifest(manifest([{ path: 'a', name: '' }]))).toThrow('name');
});

test('confirmed folders may include the repository root when it is the only project', () => {
  expect(checkProjectFolders([{ path: '' }])).toEqual([{ path: '' }]);
  expect(() => checkProjectFolders([{ path: '' }, { path: 'sales' }])).toThrow('nest');
});

test('detection proposes the smallest set of folders that holds every definition', () => {
  const files = [
    'README.md',
    'domains/sales/sales.ossie.yaml',
    'domains/sales/contracts/orders.odcs.yaml',
    'domains/finance/ledger.ttl',
    'domains/finance/notes.txt',
    'tools/build.sh',
    '.gitignore',
    '.semantic-workbench.json',
  ];
  expect(detectProjectFolders(files)).toEqual([
    { path: 'domains/finance', files: 1 },
    { path: 'domains/sales', files: 2 },
  ]);
});

test('definitions at the root make the root the one project', () => {
  expect(detectProjectFolders(['shop.yaml', 'domains/sales/sales.yaml'])).toEqual([
    { path: '', files: 2 },
  ]);
});

test('detection stops four folders down and skips Git internals', () => {
  expect(detectProjectFolders(['a/b/c/d/e/f/deep.yaml', '.git/config.yaml'])).toEqual([
    { path: 'a/b/c/d', files: 1 },
  ]);
  expect(detectProjectFolders(['docs/readme.md', 'src/app/main.ts'])).toEqual([]);
});
