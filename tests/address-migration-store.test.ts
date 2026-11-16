/** Exercises durable address history through staged journal operations. */
import { expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
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
