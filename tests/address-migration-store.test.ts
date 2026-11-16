import { historySinceDeletion } from '../src/shared/core/address-migration';
import { parseAddress } from '../src/shared/core/item-address';
/** Exercises durable address history through staged journal operations. */
import { expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { addressMigrationFile, ADDRESS_MIGRATION_LIMIT, operationMigrations, readAddressMigrations, stageAddressMigrations } from '../src/server/projects/address-migrations';
import { atomicWrite, atomicWriteJson } from '../src/server/projects/atomic';
import { createJournal } from '../src/server/projects/journal';
import { dataLayout } from '../src/server/projects/paths';
import { LOCAL_READER } from '../src/server/projects/reader';
import { tempDataDir, testWorkspace } from './helpers/temp-data-dir';

const from = 'sw1:sample/a.yaml#model:M/dataset:Old';
const to = 'sw1:sample/a.yaml#model:M/dataset:New';
const operation = { id: 'stable-operation', at: '2026-11-16T00:00:00Z', commit: 'head' };
const records = operationMigrations(operation, [{ kind: 'item', from, to }]);

function fixture() {
  const temporary = tempDataDir('address-history-');
  const layout = dataLayout(temporary.root);
  mkdirSync(layout.state, { recursive: true });
  return { ...temporary, layout, journal: createJournal(layout) };
}

function append(context: ReturnType<typeof fixture>, appended = records) {
  const staging = join(context.layout.state, `.stage-${context.journal.newId()}`);
  const steps = stageAddressMigrations({ layout: context.layout, project: 'sample', staging }, appended);
  context.journal.run('save', steps, [staging]);
}

test('record ids derive from the operation and appending the same operation twice is harmless', () => {
  const context = fixture();
  try {
    expect(records[0].id).toBe('m-stable-operation-0');
    append(context);
    append(context);
    expect(readAddressMigrations(context.layout, 'sample', LOCAL_READER)).toEqual(records);
    expect(() => append(context, [{ ...records[0], to: to + '/field:changed' }])).toThrow('different content');
    expect(readAddressMigrations(context.layout, 'sample', LOCAL_READER)).toEqual(records);
  } finally {
    context.cleanup();
  }
});

test('the uncompacted limit permits replay but rejects an overflowing file operation before any rename', () => {
  const context = fixture();
  try {
    const full = Array.from({ length: ADDRESS_MIGRATION_LIMIT }, (_, index) => ({ ...records[0], id: `record-${index}` }));
    atomicWriteJson(addressMigrationFile(context.layout, 'sample'), { formatVersion: 1, records: full });
    append(context, [full[0]]);
    const old = readFileSync(addressMigrationFile(context.layout, 'sample'));
    const document = join(context.layout.projects, 'sample/a.yaml');
    atomicWrite(document, new TextEncoder().encode('old'));
    expect(() => append(context)).toThrow('50,000-record limit');
    expect(readFileSync(addressMigrationFile(context.layout, 'sample'))).toEqual(old);
    expect(readFileSync(document, 'utf8')).toBe('old');
    expect(context.journal.pending()).toEqual([]);
  } finally {
    context.cleanup();
  }
});

test('store input rejects unsupported states, snapshots, positional history and out-of-project endpoints', () => {
  const context = fixture();
  try {
    for (const invalid of [
      { ...records[0], kind: 'future' },
      { ...records[0], id: '' },
      { ...records[0], from: from + '@snapshot' },
      { ...records[0], from: from.replace('model:M', 'model:#0') },
      { ...records[0], to: to.replace('sw1:sample/', 'sw1:hidden/') },
    ])
      expect(() => append(context, [invalid as any])).toThrow();
    expect(existsSync(addressMigrationFile(context.layout, 'sample'))).toBe(false);
  } finally {
    context.cleanup();
  }
});

for (const phase of ['before', 'after'] as const) {
  test(`three definitions and their history recover together when interrupted ${phase} every rename`, () => {
    for (let interruption = 0; interruption < 8; interruption++) {
      const context = fixture();
      try {
        atomicWriteJson(addressMigrationFile(context.layout, 'sample'), { formatVersion: 1, records: [] });
        const staging = join(context.layout.state, '.interrupted');
        const steps: { from: string; to: string }[] = [];
        const documents = Array.from({ length: 3 }, (_, index) => join(context.layout.projects, `sample/${index}.yaml`));
        documents.forEach((document, index) => {
          atomicWrite(document, new TextEncoder().encode(`old ${index}`));
          const next = join(staging, `new-${index}`);
          atomicWrite(next, new TextEncoder().encode(`new ${index}`));
          steps.push({ from: document, to: join(staging, `old-${index}`) }, { from: next, to: document });
        });
        steps.push(...stageAddressMigrations({ layout: context.layout, project: 'sample', staging }, records));
        const crash = (kind: string, step: number) => kind === 'rename-three' && step === interruption;
        const journal = createJournal(context.layout, phase === 'before' ? { crashBefore: crash } : { crashAfter: crash });
        expect(() => journal.run('rename-three', steps, [staging], operation.id)).toThrow('Simulated crash');
        const recovery = createJournal(context.layout);
        expect(recovery.recover().map(outcome => outcome.outcome)).toEqual(['completed']);
        expect(documents.map(document => readFileSync(document, 'utf8'))).toEqual(['new 0', 'new 1', 'new 2']);
        expect(readAddressMigrations(context.layout, 'sample', LOCAL_READER)).toEqual(records);
        const settled = readFileSync(addressMigrationFile(context.layout, 'sample'));
        expect(recovery.recover()).toEqual([]);
        expect(readFileSync(addressMigrationFile(context.layout, 'sample'))).toEqual(settled);
      } finally {
        context.cleanup();
      }
    }
  });
}

test('recovery rolls back definitions and history together if an uninstalled source disappeared', () => {
  const context = fixture();
  try {
    atomicWriteJson(addressMigrationFile(context.layout, 'sample'), { formatVersion: 1, records: [] });
    const staging = join(context.layout.state, '.rollback');
    const document = join(context.layout.projects, 'sample/a.yaml');
    const next = join(staging, 'new');
    atomicWrite(document, new TextEncoder().encode('old'));
    atomicWrite(next, new TextEncoder().encode('new'));
    const steps = [{ from: document, to: join(staging, 'old') }, { from: next, to: document }, ...stageAddressMigrations({ layout: context.layout, project: 'sample', staging }, records)];
    const journal = createJournal(context.layout, { crashAfter: (_kind, step) => step === 0 });
    expect(() => journal.run('save', steps, [staging], operation.id)).toThrow('Simulated crash');
    rmSync(next);
    const recovery = createJournal(context.layout);
    expect(recovery.recover().map(outcome => outcome.outcome)).toEqual(['rolled-back']);
    expect(readFileSync(document, 'utf8')).toBe('old');
    expect(readAddressMigrations(context.layout, 'sample', LOCAL_READER)).toEqual([]);
    expect(recovery.recover()).toEqual([]);
  } finally {
    context.cleanup();
  }
});

test('moves record document prefixes in both projects and history follows project trash and restore', async () => {
  using workspace = await testWorkspace();
  const first = await workspace.seed([{ path: 'a.yaml', source: 'name: O\nontology: [{concept: A}]' }], 'First');
  const second = await workspace.seed([{ path: 'b.yaml', source: 'name: P\nontology: [{concept: B}]' }], 'Second');
  const layout = dataLayout(workspace.root);
  await workspace.ws.moveFile(first.slug, 'a.yaml', first.slug, 'nested/a.yaml', false, LOCAL_READER);
  const within = readAddressMigrations(layout, first.slug, LOCAL_READER);
  expect(within).toHaveLength(1);
  expect(within[0]).toMatchObject({ kind: 'document', from: `sw1:${first.slug}/a.yaml`, to: `sw1:${first.slug}/nested/a.yaml` });
  await workspace.ws.moveFile(first.slug, 'nested/a.yaml', second.slug, 'moved.yaml', false, LOCAL_READER);
  const sourceHistory = readAddressMigrations(layout, first.slug, LOCAL_READER);
  const targetHistory = readAddressMigrations(layout, second.slug, LOCAL_READER);
  expect(sourceHistory).toHaveLength(2);
  expect(targetHistory).toEqual([sourceHistory[1]]);
  const bytes = readFileSync(addressMigrationFile(layout, second.slug));
  const removed = await workspace.ws.trash.deleteProject(second.slug);
  expect(existsSync(addressMigrationFile(layout, second.slug))).toBe(false);
  expect(readFileSync(join(layout.trash, removed.entryId, 'address-migrations', second.slug + '.json'))).toEqual(bytes);
  await workspace.ws.trash.restore(removed.entryId, {}, LOCAL_READER);
  expect(readFileSync(addressMigrationFile(layout, second.slug))).toEqual(bytes);
  const archived = await workspace.ws.trash.deleteProject(second.slug);
  await workspace.ws.trash.restore(archived.entryId, { toProject: 'restored' }, LOCAL_READER);
  expect(readFileSync(addressMigrationFile(layout, 'restored'))).toEqual(bytes);
  expect(readAddressMigrations(layout, 'restored', LOCAL_READER)).toEqual(targetHistory);
});

test('explicit item deletion records a tombstone and recreating the same address cannot inherit history', async () => {
  using workspace = await testWorkspace();
  const source = 'name: O\nontology: [{concept: A}, {concept: Keep}]';
  const project = await workspace.seed([{ path: 'a.yaml', source }], 'Sample');
  const old = workspace.ws.readFile(project.slug, 'a.yaml');
  const address = `sw1:${project.slug}/a.yaml#ontology:O/concept:A`;
  const removed = 'name: O\nontology: [{concept: Keep}]';
  await workspace.ws.saveFile(project.slug, 'a.yaml', { baseHash: old.hash, source: removed, deletedItems: [address] }, LOCAL_READER);
  const records = readAddressMigrations(dataLayout(workspace.root), project.slug, LOCAL_READER);
  expect(records.map(record => ({ kind: record.kind, from: record.from, to: record.to }))).toEqual([{ kind: 'deleted', from: address, to: undefined }]);
  const deleted = workspace.ws.readFile(project.slug, 'a.yaml');
  await workspace.ws.saveFile(project.slug, 'a.yaml', { baseHash: deleted.hash, source }, LOCAL_READER);
  const parsed = parseAddress(address);
  if (!parsed.ok) throw new Error('Invalid test locator.');
  expect(historySinceDeletion(parsed.address, readAddressMigrations(dataLayout(workspace.root), project.slug, LOCAL_READER))).toEqual({ reset: true, records: [] });
  const recreated = workspace.ws.readFile(project.slug, 'a.yaml');
  await expect(workspace.ws.saveFile(project.slug, 'a.yaml', { baseHash: recreated.hash, source, deletedItems: [address] }, LOCAL_READER)).rejects.toThrow('not removed');
  expect(workspace.ws.readFile(project.slug, 'a.yaml').hash).toBe(recreated.hash);
  expect(readAddressMigrations(dataLayout(workspace.root), project.slug, LOCAL_READER)).toEqual(records);
});

test('file deletion records a document marker that also resets descendant history after recreation', async () => {
  using workspace = await testWorkspace();
  const source = 'name: O\nontology: [{concept: A}]';
  const project = await workspace.seed([{ path: 'a.yaml', source }], 'Sample');
  await workspace.ws.trash.deleteFile(project.slug, 'a.yaml', undefined, LOCAL_READER);
  const records = readAddressMigrations(dataLayout(workspace.root), project.slug, LOCAL_READER);
  expect(records[0]).toMatchObject({ kind: 'deleted', from: `sw1:${project.slug}/a.yaml` });
  await workspace.ws.saveFile(project.slug, 'a.yaml', { baseHash: null, source }, LOCAL_READER);
  const parsed = parseAddress(`sw1:${project.slug}/a.yaml#ontology:O/concept:A`);
  if (!parsed.ok) throw new Error('Invalid test locator.');
  expect(historySinceDeletion(parsed.address, readAddressMigrations(dataLayout(workspace.root), project.slug, LOCAL_READER)).reset).toBe(true);
});
