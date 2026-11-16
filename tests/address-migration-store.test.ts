/** Exercises durable address history through staged journal operations. */
import { expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { addressMigrationFile, ADDRESS_MIGRATION_LIMIT, operationMigrations, readAddressMigrations, stageAddressMigrations } from '../src/server/projects/address-migrations';
import { atomicWrite, atomicWriteJson } from '../src/server/projects/atomic';
import { createJournal } from '../src/server/projects/journal';
import { dataLayout } from '../src/server/projects/paths';
import { LOCAL_READER } from '../src/server/projects/reader';
import { tempDataDir } from './helpers/temp-data-dir';

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
