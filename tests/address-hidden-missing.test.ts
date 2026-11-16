/** Proves that hidden locators do not cause project, file or history reads. */
import { expect, test } from 'bun:test';
import { resolveForCaller, type AddressResolutionContext } from '../src/server/projects/address-resolution';
import type { MigrationRecord } from '../src/shared/core/address-migration';
import { LOCAL_READER, type Reader } from '../src/server/projects/reader';
import { boundaryReader } from './auth/access-fixture';
import { NotFoundError } from '../src/server/projects/errors';

const prefix = 'sw1:visible/model.yaml#model:M/dataset:';
const old = prefix + 'Old';
const target = prefix + 'New';
const record: MigrationRecord = { id: 'one', kind: 'item', from: old, to: target, at: '2026-11-16T00:00:00Z', commit: '' };

function fixture(records: MigrationRecord[] = [record]) {
  const opened: string[] = [];
  const context: AddressResolutionContext = {
    projectExists: project => {
      opened.push('project:' + project);
      return project === 'visible';
    },
    readFile: (project, path) => {
      opened.push('file:' + project + '/' + path);
      if (path !== 'model.yaml') throw new NotFoundError('Missing file.');
      return { source: 'version: 0.2.0.dev0\nname: M\ndatasets: [{name: New, fields: [{name: id}]}]' };
    },
    readMigrations: project => {
      opened.push('history:' + project);
      return records;
    },
  };
  const reader: Reader = boundaryReader({ readableProjects: new Set(['visible']), canRead: (_, path) => path === 'model.yaml', roles: () => [] }, 'reader');
  return { opened, context, reader };
}

test('hidden, absent, guarded and malformed locators return identical missing answers without opening project data', () => {
  for (const address of ['sw1:hidden/model.yaml#model:M', 'sw1:absent/model.yaml#model:M', 'sw1:visible/secret.yaml#model:M', 'bad']) {
    const { opened, context, reader } = fixture();
    expect(resolveForCaller(context, address, reader)).toEqual({ status: 'missing' });
    expect(opened).toEqual([]);
  }
});

test('visible current items bypass history and missing items replay ordered visible history without source leakage', () => {
  const { opened, context, reader } = fixture();
  expect(resolveForCaller(context, target, reader)).toMatchObject({ status: 'found', address: target });
  expect(opened.some(path => path.startsWith('history:'))).toBe(false);
  opened.length = 0;
  const migrated = resolveForCaller(context, old, reader);
  expect(migrated).toMatchObject({ status: 'found', address: target });
  expect(migrated).not.toHaveProperty('source');
  expect(opened).toContain('history:visible');
  expect(resolveForCaller(context, old + '@opaque-token', reader)).toMatchObject({ status: 'found', address: target + '@opaque-token' });
});

test('hidden migration endpoints are neither followed nor opened, and deletion prevents inherited history', () => {
  const hidden = fixture([{ ...record, to: 'sw1:hidden/model.yaml#model:M/dataset:New' }]);
  expect(resolveForCaller(hidden.context, old, hidden.reader)).toEqual({ status: 'missing' });
  expect(hidden.opened.every(path => !path.includes('hidden'))).toBe(true);
  const deleted = fixture([record, { ...record, id: 'deleted', kind: 'deleted', from: target, to: undefined }]);
  expect(resolveForCaller(deleted.context, old, deleted.reader)).toEqual({ status: 'missing' });
  expect(resolveForCaller(deleted.context, target, deleted.reader).status).toBe('found');
});

test('an absent local project opens no file or migration store', () => {
  const { opened, context } = fixture();
  expect(resolveForCaller(context, 'sw1:absent/model.yaml#model:M', LOCAL_READER)).toEqual({ status: 'missing' });
  expect(opened.every(path => path === 'project:absent')).toBe(true);
});
