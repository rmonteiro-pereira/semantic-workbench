/** Rejects retired private locator spellings outside the compatibility boundary. */
import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function privateKeyTemplates(path: string): string[] {
  if (path === 'src/shared/core/item-key-adapters.ts') return [];
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const findings: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isTemplateExpression(node) && /^(?:concept|dataset|field|join|metric):/.test(node.head.text)) findings.push(`${path}:${source.getLineAndCharacterOfPosition(node.pos).line + 1}`);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return findings;
}

test('only the compatibility adapter builds old item-key template shapes', () => {
  expect(sourceFiles('src').flatMap(privateKeyTemplates)).toEqual([]);
  const graph = readFileSync('src/app/mappings/mapping-graph.ts', 'utf8');
  expect(graph).not.toMatch(/export const (?:conceptId|datasetId|metricId|fieldId)\b/);
});
