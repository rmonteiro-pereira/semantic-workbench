/** Detects new persisted fields that need an explicit locator-conversion decision. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function fields(path: string, name: string): string[] {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(statement => ts.isTypeAliasDeclaration(statement) && statement.name.text === name);
  if (!declaration || !ts.isTypeAliasDeclaration(declaration) || !ts.isTypeLiteralNode(declaration.type)) throw new Error('Persisted shape needs an inventory decision.');
  return declaration.type.members.map(member => member.name?.getText(source) ?? '').sort();
}

test('durable key-bearing shapes match the documented inventory', () => {
  expect(fields('src/app/graph/overview.ts', 'GroupingOptions')).toEqual(['assignments', 'mode', 'names']);
  expect(fields('src/server/projects/state.ts', 'ViewState')).toEqual(['files', 'formatVersion', 'publicationNotice']);
  expect(fields('src/server/projects/state.ts', 'Draft')).toEqual(['baseHash', 'formatVersion', 'patches', 'path', 'project', 'text', 'updatedAt']);
  expect(fields('src/server/projects/state.ts', 'RejectedSuggestion')).toEqual(['hash', 'path', 'project', 'rejectedAt', 'target']);
  expect(fields('src/server/projects/trash.ts', 'TrashEntry')).toEqual([
    'batchId',
    'copy',
    'deletedAt',
    'deletedBy',
    'entryId',
    'formatVersion',
    'hash',
    'kind',
    'path',
    'paths',
    'project',
    'projectName',
    'projects',
    'registry',
    'repo',
    'undoUntil',
    'unpublished',
    'view',
  ]);
  const inventory = readFileSync('docs/item-addresses.md', 'utf8');
  for (const shape of ['assignments', 'names', 'drafts', 'suggestions', 'trash', 'mapping-center', 'lineage-center', 'layout']) expect(inventory).toContain(shape);
});
