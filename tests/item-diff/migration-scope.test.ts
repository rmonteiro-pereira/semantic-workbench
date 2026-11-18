// Proves that two branches with identical definitions can have different rename provenance.
import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteJson } from '../../src/server/projects/atomic';
import { itemDiffAgentAnswers, itemDiffBaselineWorkspace } from '../helpers/item-diff-baseline';
import { publishFixture } from '../helpers/published-workspace';
import { ADDRESS_HISTORY_FILE, addressHistoryDifference, parseAddressHistory, readAddressMigrations, readCommittedAddressMigrations } from '../../src/server/projects/address-migrations';
import { compareItems } from '../../src/shared/item-diff/compare-items';
import type { DiffItem } from '../../src/shared/item-diff/item-change';
import { compileUnit } from '../../src/shared/tessera/compile-unit';
import { boundaryReader } from '../auth/access-fixture';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { testWorkspace } from '../helpers/temp-data-dir';
import { createJournal, JournalCrash } from '../../src/server/projects/journal';
import { createGit } from '../../src/server/projects/git';
import { dataLayout } from '../../src/server/projects/paths';
import { resolvePublishedForCaller } from '../../src/server/projects/address-resolution';
import { readFolder } from '../../src/server/tessera/disk-source';
import { readSnapshot } from '../../src/server/tessera/snapshot-source';

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
  const renamedCommit = git(directory, ['rev-parse', 'HEAD']);
  const fromCommit = await readCommittedAddressMigrations(fixture.ws.git, fixture.ws.layout, 'finance', renamedCommit, LOCAL_READER);
  expect(fromCommit).toEqual(recorded);
  git(directory, ['revert', '--no-edit', renamedCommit]);
  expect(readAddressMigrations(fixture.ws.layout, 'finance', LOCAL_READER)).toEqual([]);
  expect(git(directory, ['show', 'HEAD:' + path])).toContain('name: purchases');
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
  const deletion = { id: 'd-operation-11', kind: 'deleted', from: prefix + 'New', at: record.at, commit: '' };
  expect(parseAddressHistory([deletion, late].map(entry => JSON.stringify(entry)).join('\n')).map(entry => entry.id)).toEqual([late.id, deletion.id]);
});

test('Git unions independently appended histories without adding a compile input', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const project = 'finance';
  const directory = join(fixture.root, 'projects', project);
  const prefix = 'sw1:finance/finance.ontology.yaml#ontology:Finance/concept:';
  git(directory, ['add', '.']);
  git(directory, ['commit', '-m', 'Set up both branches']);
  const base = git(directory, ['rev-parse', 'HEAD']);
  git(directory, ['switch', '-c', 'history-first']);
  await fixture.ws.reconcileAddress({ operationId: 'first', from: prefix + 'First', to: prefix + 'Customer' }, LOCAL_READER);
  git(directory, ['add', '.gitattributes', ADDRESS_HISTORY_FILE]);
  git(directory, ['commit', '-m', 'Record first reconciliation']);
  git(directory, ['switch', '-c', 'history-second', base]);
  await fixture.ws.reconcileAddress({ operationId: 'second', from: prefix + 'Second', to: prefix + 'Customer' }, LOCAL_READER);
  git(directory, ['add', '.gitattributes', ADDRESS_HISTORY_FILE]);
  git(directory, ['commit', '-m', 'Record second reconciliation']);
  git(directory, ['merge', '--no-edit', 'history-first']);
  expect(
    readAddressMigrations(fixture.ws.layout, project, LOCAL_READER)
      .map(record => record.id)
      .sort(),
  ).toEqual(['r-first-0', 'r-second-0']);
  expect(fixture.ws.resolveAddress(prefix + 'First', LOCAL_READER)).toMatchObject({ status: 'found', address: prefix + 'Customer' });
  expect(fixture.ws.resolveAddress(prefix + 'Second', LOCAL_READER)).toMatchObject({ status: 'found', address: prefix + 'Customer' });
  expect(readFolder(directory).files.map(file => file.path)).not.toContain(ADDRESS_HISTORY_FILE);
  const snapshot = await readSnapshot({ repository: directory, branch: 'history-second' });
  const compiled = compileUnit(snapshot.files, { lossPolicySha256: null });
  expect(compiled.failures).toEqual([]);
  expect(compiled.report.inputs.map(input => input.path)).not.toContain(ADDRESS_HISTORY_FILE);
  expect(compiled.outputs.map(file => file.path)).not.toContain(ADDRESS_HISTORY_FILE);
});

test('address resolution sees branch aliases in the editor and only published aliases for consumers', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const prefix = 'sw1:finance/finance.ontology.yaml#ontology:Finance/concept:';
  const from = prefix + 'Former';
  const to = prefix + 'Customer';
  await fixture.ws.reconcileAddress({ operationId: 'browser-alias', from, to }, LOCAL_READER);
  const resolve = async (editor: boolean) => {
    const response = await fixture.handler(
      new Request('http://localhost:5173/api/projects/finance/item-addresses/resolve', {
        method: 'POST',
        headers: { Origin: 'http://localhost:5173', 'X-SW-Request': '1', ...(editor ? { 'Sec-Fetch-Site': 'same-origin' } : {}) },
        body: JSON.stringify({ address: from }),
      }),
    );
    expect(response.status).toBe(200);
    return response.json();
  };
  expect(await resolve(true)).toMatchObject({ status: 'found', address: to });
  expect(await resolve(false)).toEqual({ status: 'missing' });
  await publishFixture(fixture);
  expect(await resolve(false)).toMatchObject({ status: 'found', address: to });
});

test('a selective commit includes only the records for its selected definitions', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const directory = join(fixture.root, 'projects', 'finance');
  const semanticPath = 'commerce.mapped-semantic.yaml';
  const path = 'finance.ontology.yaml';
  const prefix = 'sw1:finance/finance.ontology.yaml#ontology:Finance/concept:Customer/relationship:';
  const before = fixture.ws.readFile('finance', path, LOCAL_READER);
  await fixture.ws.saveFile(
    'finance',
    path,
    {
      baseHash: before.hash,
      source: before.source.replace('name: purchases', 'name: buys'),
      declaredMigrations: [{ kind: 'item', from: prefix + 'purchases', to: prefix + 'buys' }],
    },
    LOCAL_READER,
  );
  const semantic = fixture.ws.readFile('finance', semanticPath, LOCAL_READER);
  const metric = 'sw1:finance/commerce.mapped-semantic.yaml#model:Mapped%20commerce%20semantic%20model/metric:';
  await fixture.ws.saveFile(
    'finance',
    semanticPath,
    {
      baseHash: semantic.hash,
      source: semantic.source.replaceAll('gross_revenue', 'gross_turnover'),
      declaredMigrations: [{ kind: 'item', from: metric + 'gross_revenue', to: metric + 'gross_turnover' }],
    },
    LOCAL_READER,
  );
  git(directory, ['add', semanticPath]);
  const scm = await fixture.ws.scmFor('finance', LOCAL_READER);
  await scm.commit('finance', 'Rename relationship only', { paths: [path] });
  const committed = parseAddressHistory(git(directory, ['show', 'HEAD:' + ADDRESS_HISTORY_FILE]));
  expect(committed.map(record => record.from)).toEqual([prefix + 'purchases']);
  expect(git(directory, ['diff', '--cached', '--name-only'])).toBe(semanticPath);
  expect(readAddressMigrations(fixture.ws.layout, 'finance', LOCAL_READER).map(record => record.from)).toContain(metric + 'gross_revenue');
  await scm.commit('finance', 'Commit staged metric');
  const withMetric = parseAddressHistory(git(directory, ['show', 'HEAD:' + ADDRESS_HISTORY_FILE]));
  expect(withMetric.map(record => record.from)).toEqual([prefix + 'purchases', metric + 'gross_revenue']);
  expect(git(directory, ['status', '--porcelain'])).toBe('');
});

test('discard and undo journal the history changes with the definition', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const project = 'finance';
  const path = 'finance.ontology.yaml';
  const directory = join(fixture.root, 'projects', project);
  const prefix = 'sw1:finance/finance.ontology.yaml#ontology:Finance/concept:Customer/relationship:';
  const before = fixture.ws.readFile(project, path, LOCAL_READER);
  await fixture.ws.saveFile(
    project,
    path,
    {
      baseHash: before.hash,
      source: before.source.replace('name: purchases', 'name: buys'),
      declaredMigrations: [{ kind: 'item', from: prefix + 'purchases', to: prefix + 'buys' }],
    },
    LOCAL_READER,
  );
  expect(readAddressMigrations(fixture.ws.layout, project, LOCAL_READER)).toHaveLength(1);
  const current = fixture.ws.readFile(project, path, LOCAL_READER);
  await fixture.ws.revertFile(project, path, current.hash, LOCAL_READER);
  expect(fixture.ws.readFile(project, path, LOCAL_READER).source).toContain('name: purchases');
  expect(readAddressMigrations(fixture.ws.layout, project, LOCAL_READER)).toEqual([]);
  expect(git(directory, ['status', '--porcelain'])).not.toContain(ADDRESS_HISTORY_FILE);
  const deletion = await fixture.ws.trash.deleteFile(project, path, undefined, LOCAL_READER);
  expect(readAddressMigrations(fixture.ws.layout, project, LOCAL_READER)).toMatchObject([{ kind: 'deleted' }]);
  await fixture.ws.trash.undo(deletion.entryId, LOCAL_READER);
  expect(fixture.ws.readFile(project, path, LOCAL_READER).source).toContain('name: purchases');
  expect(readAddressMigrations(fixture.ws.layout, project, LOCAL_READER)).toEqual([]);
});

test('a fresh Git clone carries aliases without a workbench state file', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const project = 'finance';
  const directory = join(fixture.root, 'projects', project);
  const prefix = 'sw1:finance/finance.ontology.yaml#ontology:Finance/concept:';
  const from = prefix + 'Former';
  const to = prefix + 'Customer';
  await fixture.ws.reconcileAddress({ operationId: 'cloned-alias', from, to }, LOCAL_READER);
  await publishFixture(fixture);
  using fresh = await testWorkspace({ watch: false });
  const clone = join(fresh.root, 'projects', project);
  git(fresh.root, ['clone', '--no-local', directory, clone]);
  const clonedLayout = dataLayout(fresh.root);
  const gitClient = createGit({ projectsRoot: clonedLayout.projects });
  const commit = git(clone, ['rev-parse', 'HEAD']);
  expect(existsSync(join(clonedLayout.state, 'address-migrations', project + '.json'))).toBe(false);
  const records = await readCommittedAddressMigrations(gitClient, clonedLayout, project, commit, LOCAL_READER);
  const result = await resolvePublishedForCaller(from, LOCAL_READER, async () => ({
    records,
    documents: [{ path: 'finance.ontology.yaml', source: git(clone, ['show', 'HEAD:finance.ontology.yaml']) }],
  }));
  expect(result).toMatchObject({ status: 'found', address: to });
});

test('the persisted history is source control bookkeeping and stays out of file reads and agent answers', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const project = 'finance';
  const prefix = 'sw1:finance/finance.ontology.yaml#ontology:Finance/concept:';
  const consumerBefore = await itemDiffAgentAnswers(fixture);
  await fixture.ws.reconcileAddress({ operationId: 'hidden-file', from: prefix + 'Former', to: prefix + 'Customer' }, LOCAL_READER);
  const status = await fixture.ws.readScm(project, LOCAL_READER).status(project, LOCAL_READER);
  expect(status.changes).toContainEqual(expect.objectContaining({ path: ADDRESS_HISTORY_FILE, hidden: true }));
  const url = `http://localhost:5173/api/projects/${project}/files/${ADDRESS_HISTORY_FILE}`;
  expect((await fixture.handler(new Request(url))).status).toBe(404);
  expect(fixture.ws.cache.files(project).map(file => file.path)).not.toContain(ADDRESS_HISTORY_FILE);
  const reader = boundaryReader({ readableProjects: new Set([project]), canRead: (_project, path) => path !== 'finance.ontology.yaml', roles: () => [] }, 'reader');
  expect(readAddressMigrations(fixture.ws.layout, project, reader)).toEqual([]);
  expect(await itemDiffAgentAnswers(fixture)).toEqual(consumerBefore);
  await publishFixture(fixture);
  const directory = join(fixture.root, 'projects', project);
  const committed = await readCommittedAddressMigrations(fixture.ws.git, fixture.ws.layout, project, git(directory, ['rev-parse', 'HEAD']), reader);
  expect(committed).toEqual([]);
  expect((await fixture.handler(new Request(url))).status).toBe(404);
});

test('project trash carries a legacy import inside the archived project', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const project = 'finance';
  const legacy = join(fixture.ws.layout.state, 'address-migrations', project + '.json');
  const prefix = 'sw1:finance/finance.ontology.yaml#ontology:Finance/concept:';
  const record = { id: 'legacy-trash', kind: 'item' as const, from: prefix + 'Former', to: prefix + 'Customer', at: '2025-01-01T00:00:00Z', commit: '' };
  atomicWriteJson(legacy, { formatVersion: 1, records: [record] });
  const entry = await fixture.ws.trash.deleteProject(project);
  expect(existsSync(legacy)).toBe(false);
  expect(existsSync(join(fixture.ws.layout.trash, entry.entryId, 'payload', project, ADDRESS_HISTORY_FILE))).toBe(true);
  await fixture.ws.trash.restore(entry.entryId, {}, LOCAL_READER);
  expect(readAddressMigrations(fixture.ws.layout, project, LOCAL_READER)).toEqual([record]);
  expect(existsSync(legacy)).toBe(false);
});

test('interrupted project trash recovers legacy import and the archived project together', async () => {
  using fixture = await testWorkspace({ watch: false, journalHooks: { crashAfter: (kind, index) => kind === 'delete' && index === 1 } });
  const { slug } = await fixture.seed([{ path: 'project.ontology.yaml', source: 'name: Project\nontology: [{concept: New}]' }], 'Project');
  const legacy = join(fixture.ws.layout.state, 'address-migrations', slug + '.json');
  const prefix = `sw1:${slug}/project.ontology.yaml#ontology:Project/concept:`;
  const record = { id: 'legacy-crash', kind: 'item', from: prefix + 'Old', to: prefix + 'New', at: '2025-01-01T00:00:00Z', commit: '' };
  atomicWriteJson(legacy, { formatVersion: 1, records: [record] });
  await expect(fixture.ws.trash.deleteProject(slug)).rejects.toBeInstanceOf(JournalCrash);
  const recovery = createJournal(fixture.ws.layout).recover();
  expect(recovery).toMatchObject([{ outcome: 'completed' }]);
  const [archived] = fixture.ws.trash.list();
  expect(archived.project).toBe(slug);
  expect(existsSync(join(fixture.ws.layout.trash, archived.entryId, 'payload', slug, ADDRESS_HISTORY_FILE))).toBe(true);
  expect(existsSync(legacy)).toBe(false);
});
