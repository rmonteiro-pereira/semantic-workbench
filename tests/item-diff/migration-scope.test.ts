// Proves that two branches with identical definitions can have different rename provenance.
import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteJson } from '../../src/server/projects/atomic';
import { itemDiffBaselineWorkspace } from '../helpers/item-diff-baseline';
import { ADDRESS_HISTORY_FILE, addressHistoryDifference, parseAddressHistory, readAddressMigrations } from '../../src/server/projects/address-migrations';
import { compareItems } from '../../src/shared/item-diff/compare-items';
import type { DiffItem } from '../../src/shared/item-diff/item-change';
import { LOCAL_READER } from '../../src/server/projects/reader';

function git(directory: string, args: string[]): string {
  const result = Bun.spawnSync(['git', ...args], { cwd: directory, env: process.env });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

test('only the branch whose saved copy records the rename pairs the old and new item', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const directory = `${fixture.root}/projects/finance`;
  const path = 'finance.ontology.yaml';
  const before = fixture.ws.readFile('finance', path, LOCAL_READER);
  const renamed = before.source.replace('name: purchases', 'name: buys');
  const prefix = 'sw1:finance/finance.ontology.yaml#ontology:Finance/concept:Customer/relationship:';
  const item = (name: string): DiffItem => ({ address: prefix + name, kind: 'relationship', name, path, data: { name } });
  git(directory, ['add', '.']);
  git(directory, ['commit', '-m', 'Save comparison base']);
  const sharedHead = git(directory, ['rev-parse', 'HEAD']);
  git(directory, ['branch', 'work/outside']);
  const baseline = readAddressMigrations(fixture.ws.layout, 'finance', LOCAL_READER);
  await fixture.ws.saveFile(
    'finance',
    path,
    {
      baseHash: before.hash,
      source: renamed,
      declaredMigrations: [{ kind: 'item' as const, from: prefix + 'purchases', to: prefix + 'buys' }],
    },
    LOCAL_READER,
  );
  const recorded = readAddressMigrations(fixture.ws.layout, 'finance', LOCAL_READER);
  expect(git(directory, ['rev-parse', 'HEAD'])).toBe(sharedHead);
  expect(compareItems([item('purchases')], [item('buys')], addressHistoryDifference(baseline, recorded))).toMatchObject([{ state: 'changed', previousAddress: prefix + 'purchases' }]);
  git(directory, ['add', path, '.gitattributes', ADDRESS_HISTORY_FILE]);
  git(directory, ['commit', '-m', 'Record rename']);
  git(directory, ['switch', 'work/outside']);
  const restored = fixture.ws.readFile('finance', path, LOCAL_READER);
  await fixture.ws.saveFile('finance', path, { baseHash: restored.hash, source: renamed }, LOCAL_READER);
  const outside = readAddressMigrations(fixture.ws.layout, 'finance', LOCAL_READER);
  expect(git(directory, ['rev-parse', 'HEAD'])).toBe(sharedHead);
  expect(fixture.ws.readFile('finance', path, LOCAL_READER).source).toBe(renamed);
  expect(compareItems([item('purchases')], [item('buys')], addressHistoryDifference(baseline, outside)).map(change => change.state)).toEqual(['added', 'removed']);
});

test('legacy history is consumed once on the first journaled save', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const path = 'finance.ontology.yaml';
  const legacy = join(fixture.ws.layout.state, 'address-migrations', 'finance.json');
  const prefix = 'sw1:finance/finance.ontology.yaml#ontology:Finance/concept:';
  const record = { id: 'legacy', kind: 'item' as const, from: prefix + 'Former', to: prefix + 'Customer', at: '2025-01-01T00:00:00Z', commit: '' };
  atomicWriteJson(legacy, { formatVersion: 1, records: [record] });
  expect(readAddressMigrations(fixture.ws.layout, 'finance', LOCAL_READER)).toEqual([record]);
  const before = fixture.ws.readFile('finance', path, LOCAL_READER);
  await fixture.ws.saveFile('finance', path, { baseHash: before.hash, source: before.source + '\n' }, LOCAL_READER);
  expect(existsSync(legacy)).toBe(false);
  expect(readAddressMigrations(fixture.ws.layout, 'finance', LOCAL_READER)).toEqual([record]);
  const saved = fixture.ws.readFile('finance', path, LOCAL_READER);
  await fixture.ws.saveFile('finance', path, { baseHash: saved.hash, source: saved.source + '\n' }, LOCAL_READER);
  expect(readAddressMigrations(fixture.ws.layout, 'finance', LOCAL_READER)).toEqual([record]);
  expect(fixture.ws.documents().map(document => document.path)).not.toContain(ADDRESS_HISTORY_FILE);
  expect(() => fixture.ws.readFile('finance', ADDRESS_HISTORY_FILE)).toThrow('File not found');
  await expect(fixture.ws.saveFile('finance', ADDRESS_HISTORY_FILE, { baseHash: null, source: '{}' }, LOCAL_READER)).rejects.toThrow('managed by the workbench');
});

test('history replay sorts union lines by record sequence and keeps the first duplicate', () => {
  const prefix = 'sw1:finance/finance.ontology.yaml#ontology:Finance/concept:';
  const record = { kind: 'item' as const, at: '2025-01-01T00:00:00Z', from: prefix + 'Old', to: prefix + 'New', commit: '' };
  const early = { ...record, id: 'm-operation-2' };
  const late = { ...record, id: 'm-operation-10' };
  const duplicate = { ...late, to: prefix + 'Other' };
  expect(parseAddressHistory([late, early, duplicate].map(entry => JSON.stringify(entry)).join('\n'))).toEqual([early, late]);
  expect(addressHistoryDifference([early], [late, early])).toEqual([late]);
});
