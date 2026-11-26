// Usage counting and the dependents list stay apart: a provider learns which published projects import it,
// never how often, by whom or when an item was read.
import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { meshWorkspace, publishDependent } from '../helpers/mesh-workspace';

const USAGE_FOLDER = 'src/server/usage';
const MESH_FOLDER = 'src/server/mesh';

// Each area must not import the other area's modules or touch the other area's folder under state/.
const forbiddenFor: Record<string, { folder: string; stateKey: string }> = {
  [USAGE_FOLDER]: { folder: MESH_FOLDER, stateKey: 'mesh' },
  [MESH_FOLDER]: { folder: USAGE_FOLDER, stateKey: 'usage' },
};

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter(name => /\.tsx?$/.test(name))
    .map(name => join(folder, name));
}

/** Resolves every relative static or dynamic import of a file to a repo-relative path. */
function importedPaths(path: string, source: string): string[] {
  const imported = ts.preProcessFile(source, true, true).importedFiles.map(file => file.fileName);
  const relativeImports = imported.filter(specifier => specifier.startsWith('.'));
  return relativeImports.map(specifier => relative('.', resolve(dirname(path), specifier)));
}

/** Finds the data layout key (`layout.usage`) or a literal state path segment (`'state/usage'`) for one area. */
function stateReads(path: string, source: string, stateKey: string): string[] {
  const found: string[] = [];
  const syntax = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const literalPath = new RegExp(`(^|/)${stateKey}(/|$)`);
  function visit(node: ts.Node) {
    if (ts.isPropertyAccessExpression(node) && node.name.text === stateKey) found.push(`${path}: reads layout.${stateKey}`);
    // Relative module specifiers are imports, which importedPaths already judges.
    const statePath = ts.isStringLiteralLike(node) && !node.text.startsWith('.') && literalPath.test(node.text);
    if (statePath) found.push(`${path}: names the state folder '${node.text}'`);
    ts.forEachChild(node, visit);
  }
  visit(syntax);
  return found;
}

/** Lists every way one file crosses into the other area. */
function violations(path: string, source: string): string[] {
  const area = Object.keys(forbiddenFor).find(folder => path.startsWith(folder + '/'));
  if (!area) return [];
  const { folder, stateKey } = forbiddenFor[area];
  const crossingImports = importedPaths(path, source).filter(target => target.startsWith(folder + '/'));
  return [...crossingImports.map(target => `${path}: imports ${target}`), ...stateReads(path, source, stateKey)];
}

function scan(folder: string): string[] {
  return sourceFiles(folder).flatMap(path => violations(path, readFileSync(path, 'utf8')));
}

test('no usage module imports the mesh modules or reads state/mesh', () => {
  expect(sourceFiles(USAGE_FOLDER).length).toBeGreaterThan(0);
  expect(scan(USAGE_FOLDER)).toEqual([]);
});

test('no mesh module imports the usage modules or reads the usage store', () => {
  expect(sourceFiles(MESH_FOLDER).length).toBeGreaterThan(0);
  expect(scan(MESH_FOLDER)).toEqual([]);
});

test('the scan catches a usage module that crosses into the mesh area', () => {
  const usageFile = `${USAGE_FOLDER}/usage-counts.ts`;
  const meshFile = `${MESH_FOLDER}/dependents-registry.ts`;
  expect(violations(usageFile, "import { createDependentsRegistry } from '../mesh/dependents-registry';")).toEqual([`${usageFile}: imports src/server/mesh/dependents-registry`]);
  expect(violations(usageFile, "const registry = await import('../mesh/dependents-registry');")).toHaveLength(1);
  expect(violations(usageFile, 'const folder = layout.mesh;')).toHaveLength(1);
  expect(violations(usageFile, "const folder = join(root, 'state/mesh');")).toHaveLength(1);
  expect(violations(meshFile, "import { createUsageStore } from '../usage/usage-store';")).toHaveLength(1);
  expect(violations(meshFile, 'const folder = layout.usage;')).toHaveLength(1);
});

/** Collects every key at any depth of a JSON value. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
}

test('the dependents answer holds no count, person or request time', async () => {
  using fixture = await meshWorkspace('separate');
  await publishDependent(fixture);
  const response = await fixture.fixture.handler(new Request('http://localhost:4310/api/projects/finance/dependents'));
  const text = await response.text();
  const answer = JSON.parse(text);
  expect(response.status).toBe(200);
  expect(answer.dependents.map((entry: object) => Object.keys(entry).sort())).toEqual([['domain', 'items', 'name', 'version']]);
  const keys = keysOf(answer);
  for (const field of ['count', 'reads', 'person', 'email', 'requestedAt', 'lastRead', 'at']) expect(keys).not.toContain(field);
  expect(text).not.toMatch(/@/);
  expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
});
