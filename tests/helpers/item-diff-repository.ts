// Builds isolated committed and saved states for item comparisons.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDataDir } from './temp-data-dir';
import type { MigrationRecord } from '../../src/shared/core/address-migration';

/** Names the independent byte changes available in the second state. */
export type RepositoryChange = 'added' | 'recorded-rename' | 'outside-rename' | 'attribute' | 'removed' | 'comment' | 'reorder' | 'crlf' | 'unparsable' | 'ambiguous';

const fixtureDirectory = new URL('../fixtures/item-diff/', import.meta.url);

/** Returns the exact ontology bytes for one independently testable change. */
export function changedOntology(change: RepositoryChange): string {
  const source = readFileSync(new URL('finance.ontology.yaml', fixtureDirectory), 'utf8');
  switch (change) {
    case 'added':
      return source + '  - concept: Invoice\n    type: EntityType\n';
    case 'recorded-rename':
      return source.replace('name: purchases', 'name: buys');
    case 'outside-rename':
      return source.replace('concept: Retired', 'concept: Former');
    case 'attribute':
      return source.replace('concept: Tier}', 'concept: String}');
    case 'removed':
      return source.replace('  - concept: Retired\n    type: EntityType\n', '');
    case 'comment':
      return '# Finance definitions\n' + source.replace('A buyer.', 'A buyer. # A comment');
    case 'reorder':
      return source.replace('tessera: 2\nversion: 0.2.0.dev0', 'version: 0.2.0.dev0\ntessera: 2');
    case 'crlf':
      return source.replaceAll('\n', '\r\n');
    case 'unparsable':
      return source + 'broken: [\n';
    case 'ambiguous':
      return source + '  - concept: Order\n    type: EntityType\n';
  }
}

/** Creates a disposable Git project; each second state starts from the original bytes. */
export async function itemDiffRepository() {
  const directory = tempDataDir('item-comparison-');
  const root = join(directory.root, 'finance');
  mkdirSync(root);
  for (const name of ['finance.ontology.yaml', 'finance.semantic.yaml']) {
    copyFileSync(new URL(name, fixtureDirectory), join(root, name));
  }
  async function git(...args: string[]) {
    const result = Bun.spawn(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
    const output = await new Response(result.stdout).text();
    const error = await new Response(result.stderr).text();
    if ((await result.exited) !== 0) throw new Error(`Fixture Git failed: ${error}`);
    return output.trim();
  }
  await git('init', '-b', 'main');
  await git('add', '.');
  await git('commit', '-m', 'Add finance definitions');
  const commit = await git('rev-parse', 'HEAD');
  function secondState(change: RepositoryChange): MigrationRecord[] {
    writeFileSync(join(root, 'finance.ontology.yaml'), changedOntology(change));
    if (change !== 'recorded-rename') return [];
    const prefix = 'sw1:finance/finance.ontology.yaml#ontology:Finance/concept:Customer/relationship:';
    return [{ id: 'rename-purchases', kind: 'item', from: prefix + 'purchases', to: prefix + 'buys', at: '2026-11-17T00:00:00Z', commit }];
  }
  return { root, commit, git, secondState, cleanup: directory.cleanup };
}
