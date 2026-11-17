/** Runs focused caller-boundary and durable-replay assertions against candidate modules. */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { configureLogging } from '../src/server/observability/log';
import { boundaryReader } from '../tests/auth/access-fixture';
import { LOCAL_READER } from '../src/server/projects/reader';
import { tempDataDir } from '../tests/helpers/temp-data-dir';
import { dataLayout } from '../src/server/projects/paths';
import { createJournal } from '../src/server/projects/journal';
import type * as Resolution from '../src/server/projects/address-resolution';
import type * as Store from '../src/server/projects/address-migrations';

/** Proves both the hidden response and lack of reads through real parsing and model inspection. */
export function serverAddressCase(candidate: typeof Resolution) {
  const lines: string[] = [];
  configureLogging({ level: 'debug', format: 'json', write: line => lines.push(line) });
  const originalLog = console.log;
  console.log = (...values) => lines.push(JSON.stringify(values));
  const opened: string[] = [];
  const context = {
    projectExists: (project: string) => {
      opened.push(project);
      return true;
    },
    readFile: () => ({ source: 'name: SecretScope\nontology: [{concept: SecretItem}]' }),
    readMigrations: () => [],
  };
  const reader = boundaryReader({ readableProjects: new Set(['visible']), canRead: () => true, roles: () => [] }, 'reader');
  const hidden = 'sw1:hidden/private.yaml#ontology:SecretScope/concept:SecretItem';
  assert.deepEqual(candidate.resolveForCaller(context, hidden, reader), { status: 'missing' });
  assert.deepEqual(opened, []);
  assert.equal(candidate.resolveForCaller(context, hidden.replace('hidden/', 'visible/'), reader).status, 'found');
  addressReplayCase(candidate, reader);
  reconciledAliasCase(candidate, reader);
  console.log = originalLog;
  for (const forbidden of ['sw1:', 'hidden', 'visible', 'private.yaml', 'SecretScope', 'SecretItem']) assert(!lines.join('\n').includes(forbidden));
}

function addressReplayCase(candidate: typeof Resolution, reader: typeof LOCAL_READER) {
  const oldAddress = 'sw1:visible/a.yaml#ontology:O/concept:Old';
  const targetAddress = oldAddress.replace('concept:Old', 'concept:New');
  const replayContext = {
    projectExists: () => true,
    readFile: () => ({ source: 'name: O\nontology: [{concept: New}]' }),
    readMigrations: () => [
      { id: 'delete', kind: 'deleted' as const, from: oldAddress, at: '', commit: '' },
      { id: 'reconcile', kind: 'reconciliation' as const, from: oldAddress, to: targetAddress, at: '', commit: '' },
    ],
  };
  assert.equal(candidate.resolveForCaller(replayContext, oldAddress, reader).status, 'found');
  const movedAddress = oldAddress.replace('visible/a.yaml', 'destination/b.yaml');
  const move = { id: 'move', kind: 'document' as const, from: 'sw1:visible/a.yaml', to: 'sw1:destination/b.yaml', at: '', commit: '' };
  const arrivalContext = {
    ...replayContext,
    readMigrations: (project: string) =>
      project === 'visible'
        ? [move]
        : [
            move,
            { id: 'deleted-target', kind: 'deleted' as const, from: movedAddress, at: '', commit: '' },
            { id: 'new-rename', kind: 'item' as const, from: movedAddress, to: movedAddress.replace('concept:Old', 'concept:New'), at: '', commit: '' },
          ],
  };
  const arrivalReader = boundaryReader({ readableProjects: new Set(['visible', 'destination']), canRead: () => true, roles: () => [] }, 'reader');
  assert.equal(candidate.resolveForCaller(arrivalContext, oldAddress, arrivalReader).status, 'missing');
  const renamedFirst = {
    ...arrivalContext,
    readMigrations: (project: string) => {
      const records = arrivalContext.readMigrations(project);
      return project === 'visible' ? records : [records[0], records[2], records[1]];
    },
  };
  assert.equal(candidate.resolveForCaller(renamedFirst, oldAddress, arrivalReader).status, 'found');
}

function reconciledAliasCase(candidate: typeof Resolution, reader: typeof LOCAL_READER) {
  const oldAddress = 'sw1:visible/a.yaml#ontology:O/concept:Old';
  const renamedAddress = oldAddress.replace('concept:Old', 'concept:Renamed');
  const targetAddress = oldAddress.replace('concept:Old', 'concept:New');
  const records = [
    { id: 'rename', kind: 'item' as const, from: oldAddress, to: renamedAddress, at: '', commit: '' },
    { id: 'delete', kind: 'deleted' as const, from: renamedAddress, at: '', commit: '' },
    { id: 'reconcile', kind: 'reconciliation' as const, from: renamedAddress, to: targetAddress, at: '', commit: '' },
  ];
  const context = {
    projectExists: () => true,
    readFile: () => ({ source: 'name: O\nontology: [{concept: New}]' }),
    readMigrations: () => records,
  };
  const resolved = candidate.resolveForCaller(context, oldAddress, reader);
  assert.equal(resolved.status, 'found');
  if (resolved.status === 'found') assert.equal(resolved.address, targetAddress);
  const snapshot = candidate.resolveForCaller(context, oldAddress + '@opaque', reader);
  assert.equal(snapshot.status, 'found');
  if (snapshot.status === 'found') assert.equal(snapshot.address, targetAddress + '@opaque');
  const unrelated = {
    ...context,
    readMigrations: () => [
      ...records.slice(0, 2),
      { ...records[2], from: oldAddress.replace('concept:Old', 'concept:Unrelated') },
      { id: 'reused-rename', kind: 'item' as const, from: renamedAddress, to: targetAddress, at: '', commit: '' },
    ],
  };
  assert.equal(candidate.resolveForCaller(unrelated, oldAddress, reader).status, 'missing');
}

/** Replays the same operation through real journal installation and requires exactly one record. */
export function addressStoreCase(candidate: typeof Store) {
  const temporary = tempDataDir('address-store-mutant-');
  try {
    const layout = dataLayout(temporary.root);
    const journal = createJournal(layout);
    const record = candidate.operationMigrations({ id: 'repeat', at: '2026-11-16T00:00:00Z', commit: '' }, [
      { kind: 'item', from: 'sw1:p/a.yaml#ontology:O/concept:A', to: 'sw1:p/a.yaml#ontology:O/concept:B' },
    ]);
    const [reconciliation] = candidate.operationMigrations({ id: 'repeat', at: '2026-11-16T00:00:00Z', commit: '' }, [{ kind: 'reconciliation', from: record[0].from, to: record[0].to }]);
    assert.equal(reconciliation.id, 'r-repeat-0');
    assert.notEqual(reconciliation.id, record[0].id);
    for (let index = 0; index < 2; index++) {
      const staging = join(layout.state, 'stage-' + index);
      const steps = candidate.stageAddressMigrations({ layout, project: 'p', staging }, record);
      journal.run('save', steps, [staging]);
    }
    assert.deepEqual(candidate.readAddressMigrations(layout, 'p', LOCAL_READER), record);
  } finally {
    temporary.cleanup();
  }
}
