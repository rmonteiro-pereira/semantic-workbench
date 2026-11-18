// Both transports must reach the same handlers and preserve target authorization.
import { expect, spyOn, test } from 'bun:test';
import { join } from 'node:path';
import { createHandler } from '../../src/server/handler';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createAuditLog } from '../../src/server/auth/audit';
import { mintCaller } from '../../src/server/auth/caller';
import { buildTwinRequest } from '../../src/server/auth/twin-request';
import { operationById } from '../../src/server/auth/operation-inventory';
import type { Workspace } from '../../src/server/projects/workspace';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { authWorkspace } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { accessFixture, person } from './access-fixture';

const origin = 'http://localhost:5312';
const ordinaryFile = 'orders.odcs.yaml';
const restrictedFile = 'finance/revenue-recognition.odcs.yaml';
const modes = ['allowed', 'denied-action', 'denied-target', 'hidden', 'missing', 'mixed'] as const;
type Scenario = (typeof modes)[number];
type ParityCase = { id: string; body?: (path: string, project: string, scenario: Scenario) => unknown };

/** Real handler requests shared with the inventory's authorization coverage check. */
export const parityCases: ParityCase[] = [
  { id: 'git.stage', body: path => ({ paths: [path] }) },
  { id: 'git.unstage', body: path => ({ paths: [path] }) },
  { id: 'git.commit', body: path => ({ message: 'Parity commit', paths: [path] }) },
  { id: 'git.commit', body: path => ({ message: 'Parity push', paths: [path], push: true }) },
  { id: 'git.revert', body: path => ({ path, baseHash: null }) },
  { id: 'git.switch', body: () => ({ branch: 'parity', create: true }) },
  { id: 'git.publish', body: () => ({}) },
  { id: 'git.adopt', body: () => ({}) },
  { id: 'git.pushDefault' },
  { id: 'git.remote.set', body: () => ({ name: 'origin', url: '/unavailable-parity-remote' }) },
  { id: 'git.folder.set', body: () => ({ folder: '.' }) },
  { id: 'files.save', body: () => ({ baseHash: null, source: 'ontology: []' }) },
  {
    id: 'files.saveBatch',
    body: (path, _project, scenario) => ({ files: (scenario === 'mixed' ? [ordinaryFile, path] : [path]).map(file => ({ path: file, baseHash: null, source: 'ontology: []' })) }),
  },
  { id: 'itemAddresses.resolve', body: (path, project) => ({ address: `sw1:${project}/${path}#ontology:O` }) },
  { id: 'itemAddresses.reconcile', body: (path, project) => ({ operationId: 'parity-reconcile', from: `sw1:${project}/${path}#ontology:Old`, to: `sw1:${project}/${path}#ontology:New` }) },
  { id: 'files.delete', body: () => ({ confirm: true }) },
  { id: 'files.move', body: (path, project, scenario) => ({ path: scenario === 'mixed' ? ordinaryFile : path, toProject: scenario === 'mixed' ? 'hr-people' : project, toPath: 'moved.yaml' }) },
  { id: 'files.import', body: (path, _project, scenario) => ({ files: (scenario === 'mixed' ? [ordinaryFile, path] : [path]).map(file => ({ path: file, source: 'ontology: []' })) }) },
  { id: 'documents.save', body: (path, project) => ({ id: `${project}/${path}`, filename: path, source: 'ontology: []' }) },
  { id: 'repositories.clone', body: () => ({ url: '/unavailable-parity-remote', domain: 'sales' }) },
  { id: 'trash.restore', body: () => ({}) },
  { id: 'trash.undo', body: () => ({}) },
  { id: 'suggestions.accept' },
  { id: 'proposals.create', body: (_path, project) => ({ name: 'Parity proposal', projects: [project] }) },
  { id: 'projects.create', body: (_path, _project, scenario) => ({ name: 'Parity project', domain: scenario === 'denied-target' ? 'hr' : 'sales' }) },
];

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (!value || typeof value !== 'object') {
    if (typeof value !== 'string') return value;
    return value
      .replace(/[0-9A-HJKMNP-TV-Z]{26}/g, '<entry>')
      .replace(/\b[0-9a-f]{40,64}\b/g, '<hash>')
      .replace(/\/tmp\/[^\s"']+/g, '<temporary>');
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !['at', 'prev', 'requestId', 'createdAt', 'lastMovementAt', 'updatedAt', 'undoUntil', 'origin', 'tool', 'connection', 'undoUntil'].includes(key))
      .map(([key, item]) => {
        if (key === 'op') return [key, '<operation>'];
        if (key === 'rules' && Array.isArray(item)) return [key, [...item].sort()];
        return [key, normalized(item)];
      }),
  );
}

function parityRequest(entry: ParityCase, scenario: Scenario, project: string, path: string, entryId: string) {
  const definition = operationById(entry.id);
  if (!definition) throw Error('Missing parity operation: ' + entry.id);
  const template = definition.row.split(' ').slice(1).join(' ');
  const params: Record<string, string> = {};
  for (const match of template.matchAll(/:([a-z]+)|\*/g)) {
    const key = match[1] ?? '*';
    let value = path;
    if (key === 'slug') value = project;
    if (key === 'id') value = '00000000000000000000';
    if (key === 'entry') value = scenario === 'missing' ? '00000000000000000000000000' : entryId;
    params[key] = value;
  }
  const body = entry.body?.(path, project, scenario);
  return buildTwinRequest(entry.id, { params, body });
}

async function settleClone(ws: Workspace, payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('op' in payload) || typeof payload.op !== 'string') throw Error('Clone acceptance lacks an operation id.');
  for (let attempt = 0; attempt < 400; attempt++) {
    const finished = ws.events.replay(0)?.some(event => {
      const data = event.data as { op?: string; phase?: string };
      return event.event === 'clone' && data.op === payload.op && ['done', 'failed', 'cancelled'].includes(data.phase ?? '');
    });
    if (finished) return;
    await Bun.sleep(10);
  }
  ws.cancelClone(payload.op);
  throw Error('Clone did not settle before parity workspace disposal.');
}

async function invoke(entry: ParityCase, scenario: Scenario, twin: boolean) {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  let username: 'dave' | 'carol' | 'alice' = 'alice';
  if (scenario === 'allowed') username = 'dave';
  if (scenario === 'denied-action') username = 'carol';
  const principal = access.principalFor(person(username));
  const audit = createAuditLog({ dir: join(fixture.root, 'parity-audit') });
  const handler = createHandler(fixture.ws, { mode: 'server', access, audit, principal: () => principal, publicOrigin: origin, port: 5312, remoteCredentials: allowEveryRemote() });
  let project = 'sales-contracts';
  if (scenario === 'hidden') project = 'hr-people';
  if (scenario === 'missing') project = 'missing';
  let path = project === 'hr-people' ? 'people.odcs.yaml' : ordinaryFile;
  if (['denied-target', 'mixed'].includes(scenario)) path = restrictedFile;
  const deleted = await fixture.ws.trash.deleteFile('hr-people', 'people.odcs.yaml', undefined, LOCAL_READER);
  const suggestion = { id: '00000000000000000000', file: { project, path, hash: 'fixture' }, targetProject: scenario === 'mixed' ? 'hr-people' : 'sales-contracts', reasons: [] };
  const suggestions = spyOn(fixture.ws, 'suggestions').mockReturnValue([suggestion] as never);
  try {
    const request = parityRequest(entry, scenario, project, path, deleted.entryId);
    const response = twin
      ? (await handler.boundary.operate({ caller: mintCaller({ principal, origin: 'mcp' }), request })).response
      : await handler(
          new Request(origin + new URL(request.url).pathname, {
            method: request.method,
            body: await request.text(),
            headers: { ...Object.fromEntries(request.headers), Origin: origin, 'X-SW-Request': '1' },
          }),
        );
    const text = await response.text();
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      /* Empty and text responses retain their HTTP representation. */
    }
    if (entry.id === 'repositories.clone' && response.status === 200) await settleClone(fixture.ws, payload);
    return { status: response.status, body: normalized(payload), audit: audit.recent(10).map(normalized) };
  } finally {
    suggestions.mockRestore();
  }
}

for (const entry of parityCases) {
  test(`${entry.id} preserves HTTP decisions and handler results for every target scenario`, async () => {
    for (const scenario of modes) {
      const http = await invoke(entry, scenario, false);
      const twin = await invoke(entry, scenario, true);
      expect(twin, `${entry.id}: ${scenario}`).toEqual(http);
      expect(http.audit.length, `${entry.id}: ${scenario} never duplicates audit`).toBeLessThanOrEqual(1);
      if (scenario === 'denied-action') expect([403, 404]).toContain(http.status);
      if (['git.stage', 'git.unstage', 'git.commit', 'git.revert'].includes(entry.id) && ['denied-target', 'mixed'].includes(scenario)) {
        expect(http.status, 'restricted target must be checked by the handler').toBe(404);
      }
    }
  }, 60000);
}

async function visibleResponse(response: Response) {
  const headers = Object.fromEntries(response.headers);
  if (headers['x-request-id']) headers['x-request-id'] = '<request-id>';
  return { status: response.status, headers, body: await response.text() };
}

test('hidden and missing twins have identical visible responses and preserve separate trash audit outcomes', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const audit = createAuditLog({ dir: join(fixture.root, 'hidden-audit') });
  const handler = createHandler(fixture.ws, { mode: 'server', access, audit, principal: () => principal, publicOrigin: origin, remoteCredentials: allowEveryRemote() });
  const caller = mintCaller({ principal, origin: 'mcp' });
  const deleted = await fixture.ws.trash.deleteFile('hr-people', 'people.odcs.yaml', undefined, LOCAL_READER);
  const cases = [
    ['files.read', { slug: 'sales-contracts', '*': restrictedFile }, { slug: 'sales-contracts', '*': 'finance/missing.yaml' }],
    ['metrics.list', { slug: 'hr-people' }, { slug: 'missing' }],
    ['trash.restore', { entry: deleted.entryId }, { entry: '00000000000000000000000000' }],
  ] as const;
  for (const [operation, hidden, missing] of cases) {
    const results = [];
    for (const params of [hidden, missing]) {
      const before = audit.recent(100).length;
      const request = buildTwinRequest(operation, { params, ...(operation === 'trash.restore' ? { body: {} } : {}) });
      const started = performance.now();
      const result = await handler.boundary.operate({ caller, request });
      results.push(await visibleResponse(result.response));
      // Both refusals perform bounded local checks rather than dispatching remote work.
      expect(performance.now() - started).toBeLessThan(5000);
      const records = audit.recent(100).slice(before);
      if (operation === 'trash.restore' && params === missing) expect(records).toHaveLength(0);
      else expect(records).toMatchObject([{ decision: 'deny', reason: 'not-readable' }]);
    }
    expect(results[0]).toEqual(results[1]);
    expect(results[0].status).toBe(404);
  }
  const local = createHandler(fixture.ws);
  const request = buildTwinRequest('files.read', { params: { slug: 'missing', '*': 'missing.yaml' } });
  const http = await local(new Request(origin + new URL(request.url).pathname));
  const twin = await local.boundary.operate({ caller: mintCaller({ principal: (await import('../../src/server/auth/principal')).localPrincipal(), origin: 'mcp' }), request });
  expect(await twin.response.text()).toBe(await http.text());
});
