/** Proves all-or-nothing grouping conversion and exact recovery of the prior bytes. */
import { expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { inspect, isStructuredEntity } from '../src/shared/core/model';
import { decodeGrouping } from '../src/shared/core/grouping-addresses';
import { convertAddressKeys } from '../src/server/projects/address-key-conversion';
import { atomicWrite, atomicWriteJson } from '../src/server/projects/atomic';
import { createJournal } from '../src/server/projects/journal';
import { dataLayout, projectFile } from '../src/server/projects/paths';
import { createState } from '../src/server/projects/state';
import { tempDataDir } from './helpers/temp-data-dir';

function fixture() {
  const temporary = tempDataDir('address-key-conversion-');
  const layout = dataLayout(temporary.root);
  for (const path of [layout.state, layout.trash, layout.backup]) mkdirSync(path, { recursive: true });
  const source = stringify({ name: 'Catalog', ontology: Array.from({ length: 1000 }, (_, index) => ({ concept: `Concept ${index}`, type: 'EntityType' })) });
  atomicWrite(projectFile(layout, 'sample', 'model.yaml'), new TextEncoder().encode(source));
  const model = inspect(source, 'model.yaml');
  const entities = model.entities.filter(isStructuredEntity);
  const assignments = Object.fromEntries([...entities.slice(0, 999).map(entity => [entity.id, 'group']), ['missing/old', 'kept']]);
  const state = createState(layout);
  state.writeView('sample', { 'model.yaml': { mode: 'declared', assignments, names: { group: 'Business' } } });
  const original = readFileSync(state.viewFile('sample'), 'utf8');
  return { ...temporary, layout, state, source, model, assignments, original, journal: createJournal(layout) };
}

test('one thousand assignments are converted or reported and the backup restores exact bytes', () => {
  const context = fixture();
  try {
    const report = convertAddressKeys(context)!;
    expect(report.converted + report.kept.length).toBe(1000);
    expect(report.converted).toBe(999);
    expect(report.kept.map(entry => entry.key)).toEqual(['missing/old']);
    const value = context.state.view('sample').files['model.yaml'] as any;
    expect(Object.keys(value.assignments).filter(key => key.startsWith('sw1:'))).toHaveLength(999);
    expect(value.assignments['missing/old']).toBe('kept');
    expect(decodeGrouping(value, context.model.entities, { project: 'sample', document: ['model.yaml'] }).assignments).toEqual(context.assignments);
    expect(readFileSync(projectFile(context.layout, 'sample', 'model.yaml'), 'utf8')).toBe(context.source);
    expect(convertAddressKeys(context)).toBeNull();
    const backup = readFileSync(join(report.backup, 'state/views/sample.json'), 'utf8');
    expect(backup).toBe(context.original);
    writeFileSync(context.state.viewFile('sample'), backup);
    expect(readFileSync(context.state.viewFile('sample'), 'utf8')).toBe(context.original);
  } finally {
    context.cleanup();
  }
});

test('a backup hash failure installs no converted file or completion marker', () => {
  const context = fixture();
  try {
    expect(() => convertAddressKeys(context, { beforeVerify: backup => writeFileSync(join(backup, 'state/views/sample.json'), '{}') })).toThrow('Backup hash mismatch');
    expect(readFileSync(context.state.viewFile('sample'), 'utf8')).toBe(context.original);
    expect(readFileSync(projectFile(context.layout, 'sample', 'model.yaml'), 'utf8')).toBe(context.source);
    expect(existsSync(join(context.layout.state, 'address-key-conversion.json'))).toBe(false);
  } finally {
    context.cleanup();
  }
});

test('unknown store shapes stop conversion without replacing any store', () => {
  const context = fixture();
  try {
    atomicWriteJson(context.state.viewFile('other'), { formatVersion: 1, files: { 'unknown.yaml': { futureKeys: {} } } });
    expect(() => convertAddressKeys(context)).toThrow('Unknown persisted grouping shape');
    expect(readFileSync(context.state.viewFile('sample'), 'utf8')).toBe(context.original);
    expect(existsSync(join(context.layout.state, 'address-key-conversion.json'))).toBe(false);
  } finally {
    context.cleanup();
  }
});
