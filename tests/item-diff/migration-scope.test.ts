// Documents the existing migration store's provenance across two branches at the same HEAD.
import { expect, test } from 'bun:test';
import { itemDiffBaselineWorkspace } from '../helpers/item-diff-baseline';
import { readAddressMigrations } from '../../src/server/projects/address-migrations';
import { LOCAL_READER } from '../../src/server/projects/reader';

function git(directory: string, args: string[]): string {
  const result = Bun.spawnSync(['git', ...args], { cwd: directory, env: process.env });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

test('migration history cannot distinguish recorded and outside renames on sibling saved branches', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const directory = `${fixture.root}/projects/finance`;
  const path = 'finance.ontology.yaml';
  const before = fixture.ws.readFile('finance', path, LOCAL_READER);
  const renamed = before.source.replace('name: purchases', 'name: buys');
  const prefix = 'sw1:finance/finance.ontology.yaml#ontology:Finance/concept:Customer/relationship:';
  await fixture.ws.saveFile(
    'finance',
    path,
    {
      baseHash: before.hash,
      source: renamed,
      declaredMigrations: [{ kind: 'item', from: prefix + 'purchases', to: prefix + 'buys' }],
    },
    LOCAL_READER,
  );
  const recordedHistory = readAddressMigrations(fixture.ws.layout, 'finance', LOCAL_READER);
  expect(recordedHistory).toHaveLength(1);
  expect(recordedHistory[0].commit).toBe(git(directory, ['rev-parse', 'HEAD']));
  const current = fixture.ws.readFile('finance', path, LOCAL_READER);
  await fixture.ws.saveFile('finance', path, { baseHash: current.hash, source: before.source }, LOCAL_READER);
  git(directory, ['switch', '-c', 'work/outside']);
  const restored = fixture.ws.readFile('finance', path, LOCAL_READER);
  await fixture.ws.saveFile('finance', path, { baseHash: restored.hash, source: renamed }, LOCAL_READER);
  expect(git(directory, ['branch', '--show-current'])).toBe('work/outside');
  expect(fixture.ws.readFile('finance', path, LOCAL_READER).source).toBe(renamed);
  expect(readAddressMigrations(fixture.ws.layout, 'finance', LOCAL_READER)).toEqual(recordedHistory);
  expect(recordedHistory[0].commit).toBe(git(directory, ['rev-parse', 'HEAD']));
});
