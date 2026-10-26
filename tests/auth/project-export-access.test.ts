// The export holds only the files the person may read, reports the rest by count, is recorded
// in the audit log, and is open to viewers and refused to people without access.
import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { authWorkspace, fixtureFiles, leakMarker } from '../helpers/auth-workspace';
import { readZip } from '../helpers/zip-reader';
import { accessFixture, person } from './access-fixture';
import { apiRequest, ORIGIN, salesViewer } from './working-copy-fixture';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createHandler } from '../../src/server/handler';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';

const HIDDEN = 'finance/revenue-recognition.odcs.yaml';
const CONTRACTS = 'sales-contracts';

function exporter(fixture: Awaited<ReturnType<typeof authWorkspace>>, identity = salesViewer()) {
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(identity);
  fixture.ws.state.recordUser(principal, new Date().toISOString());
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: ORIGIN,
    access,
    principal: () => access.principalFor(identity),
  });
  return (path: string) => handler(apiRequest(path));
}

function auditEntries(root: string) {
  const dir = join(root, 'state', 'audit');
  return readdirSync(dir)
    .filter(name => name.endsWith('.jsonl'))
    .flatMap(name => readFileSync(join(dir, name), 'utf8').trim().split('\n'))
    .map(line => JSON.parse(line));
}

test('a viewer receives the readable files and a count of the files left out', async () => {
  using fixture = await authWorkspace();
  const response = await exporter(fixture)(`/api/projects/${CONTRACTS}/export`);
  expect(response.status).toBe(200);
  expect(response.headers.get('x-export-omitted')).toBe('1');
  const archive = new Uint8Array(await response.arrayBuffer());
  const stored = readZip(archive);
  const readable = fixtureFiles(CONTRACTS).filter(file => file.path !== HIDDEN);
  expect([...stored.keys()].sort()).toEqual(readable.map(file => file.path).sort());
  const everything = new TextDecoder('latin1').decode(archive);
  expect(everything).not.toContain(leakMarker(CONTRACTS, HIDDEN));
  expect(everything).not.toContain('revenue-recognition');
  expect(response.headers.get('x-export-files')).toBe(String(readable.length));
});

test('a person who may read every file receives all of them and an omitted count of zero', async () => {
  using fixture = await authWorkspace();
  const response = await exporter(fixture, person('frank'))(`/api/projects/${CONTRACTS}/export`);
  expect(response.status).toBe(200);
  expect(response.headers.get('x-export-omitted')).toBe('0');
  const stored = readZip(new Uint8Array(await response.arrayBuffer()));
  expect(stored.has(HIDDEN)).toBe(true);
});

test('a person without access, and a project they cannot read, answer without a download', async () => {
  using fixture = await authWorkspace();
  const nobody = await exporter(fixture, person('erin'))(`/api/projects/${CONTRACTS}/export`);
  expect(nobody.status).toBe(403);
  const hidden = await exporter(fixture)('/api/projects/hr-people/export');
  expect(hidden.status).toBe(404);
  const missing = await exporter(fixture)('/api/projects/no-such-project/export');
  expect(missing.status).toBe(404);
});

test('Git history is refused while the person cannot read every path ever committed', async () => {
  using fixture = await authWorkspace();
  const refused = await exporter(fixture)(`/api/projects/${CONTRACTS}/export?history=1`);
  expect(refused.status).toBe(400);
  expect(await refused.text()).not.toContain('finance');
  const allowed = await exporter(
    fixture,
    person('frank'),
  )(`/api/projects/${CONTRACTS}/export?history=1`);
  expect(allowed.status).toBe(200);
  const stored = readZip(new Uint8Array(await allowed.arrayBuffer()));
  expect(stored.has('git-history.bundle')).toBe(true);
});

test('every export is recorded in the audit log with the person and the project', async () => {
  using fixture = await authWorkspace();
  const before = auditEntries(fixture.root).length;
  await exporter(fixture)(`/api/projects/${CONTRACTS}/export`);
  const added = auditEntries(fixture.root).slice(before);
  const entry = added.find(item => item.action === 'export');
  expect(entry).toBeDefined();
  expect(entry.decision).toBe('allow');
  expect(entry.outcome).toBe('ok');
  expect(entry.resource).toEqual({ type: 'project', project: CONTRACTS });
  expect(entry.principal.id).toBe(
    createAccessControl(accessFixture()).principalFor(salesViewer()).id,
  );
  expect(JSON.stringify(entry)).not.toContain('revenue-recognition');
});
