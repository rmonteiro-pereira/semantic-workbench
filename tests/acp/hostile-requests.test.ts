// Hostile and unsupported requests from the agent change nothing: not the data root, not Git, not the audit log, and no terminal or other method runs.
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHandler } from '../../src/server/handler';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createAuditLog } from '../../src/server/auth/audit';
import { INCOMING_PARAM_SCHEMAS, createClientSurface } from '../../src/server/acp/client-surface';
import { mintAcpCaller } from '../../src/server/acp/connection-auth';
import { createFileRequests } from '../../src/server/acp/file-requests';
import { createFloodGuard } from '../../src/server/acp/flood-guard';
import { createJsonRpcConnection, type Violation } from '../../src/server/acp/jsonrpc-connection';
import type { PanelEventBody } from '../../src/server/acp/panel-events';
import { createVersionRecords } from '../../src/server/acp/version-records';
import { authWorkspace } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { accessFixture, person } from '../auth/access-fixture';

const SESSION = 'agent-session-1';

function digestOf(root: string, skip: string[]): string {
  const hash = createHash('sha256');
  const walk = (directory: string) => {
    for (const name of readdirSync(directory).sort()) {
      const full = join(directory, name);
      const relativeName = relative(root, full);
      if (skip.some(prefix => relativeName.startsWith(prefix))) continue;
      if (statSync(full).isDirectory()) walk(full);
      else hash.update(relativeName).update(readFileSync(full));
    }
  };
  walk(root);
  return hash.digest('hex');
}

function gitState(root: string): string {
  const repositories = readdirSync(join(root, 'projects')).filter(name => existsSync(join(root, 'projects', name, '.git')));
  return repositories
    .map(
      name =>
        execFileSync('git', ['-C', join(root, 'projects', name), 'log', '--format=%H %s', '-n', '20'], { encoding: 'utf8' }) +
        execFileSync('git', ['-C', join(root, 'projects', name), 'status', '--porcelain'], { encoding: 'utf8' }),
    )
    .join('\n');
}

async function harness() {
  const fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('dave'));
  const audit = createAuditLog({ dir: join(fixture.root, 'panel-audit') });
  const handler = createHandler(fixture.ws, { mode: 'server', access, audit, principal: () => principal, publicOrigin: 'http://localhost:5312', port: 5312, remoteCredentials: allowEveryRemote() });
  const caller = mintAcpCaller({ principal, connection: 'acp-hostile', scope: ['read', 'localWrite'] });
  const guard = createFloodGuard({ now: () => Date.now() });
  const files = createFileRequests({
    operate: async request => (await handler.boundary.operate({ caller, request })).response,
    versions: createVersionRecords(),
    admit: () => {
      const admission = guard.admit();
      return admission.ok ? { ok: true, release: () => admission.permit.release() } : { ok: false };
    },
  });
  const events: PanelEventBody[] = [];
  const surface = createClientSurface({ files, emit: event => events.push(event), agentSessionId: () => SESSION });
  const sent: Record<string, unknown>[] = [];
  const violations: Violation[] = [];
  const connection = createJsonRpcConnection({
    send: message => sent.push(message),
    handleRequest: surface.handleRequest,
    handleNotification: surface.handleNotification,
    onViolation: violation => violations.push(violation),
    paramSchemas: INCOMING_PARAM_SCHEMAS,
  });
  const snapshot = () => ({ data: digestOf(fixture.root, ['panel-audit']), git: gitState(fixture.root), audit: audit.recent(1000).length });
  return { fixture, connection, sent, violations, events, snapshot };
}

const frame = (id: number, method: string, params: unknown) => JSON.stringify({ jsonrpc: '2.0', id, method, params });
const settle = () => new Promise(resolve => setTimeout(resolve, 20));
const read = (path: unknown) => ({ method: 'fs/read_text_file', params: { sessionId: SESSION, path } });
const write = (path: unknown) => ({ method: 'fs/write_text_file', params: { sessionId: SESSION, path, content: 'x: 1\n' } });

const hostile: [string, { method: string; params: unknown }][] = [
  ['read of a server path', read('/etc/passwd')],
  ['read of the data root', read('/tmp/workbench-data/projects/sales-contracts/orders.odcs.yaml')],
  ['read of a home path', read('/home/rodrigo/.ssh/id_ed25519')],
  ['read of a file url', read('file:///etc/passwd')],
  ['read of a relative path', read('orders.odcs.yaml')],
  ['read of a drive path', read('C:\\Windows\\win.ini')],
  ['read with traversal', read('/workbench/sales-contracts/../hr-people/people.odcs.yaml')],
  ['read with traversal out of the root', read('/workbench/../etc/passwd')],
  ['read with encoded separators', read('/workbench/sales-contracts/%2e%2e%2fhr-people/x')],
  ['read with a backslash', read('/workbench/sales-contracts/a\\b')],
  ['read with a null byte', read('/workbench/sales-contracts/a\0b')],
  ['read of the git folder', read('/workbench/sales-contracts/.git/config')],
  ['read of a very long path', read('/workbench/sales-contracts/' + 'a'.repeat(5000))],
  ['read of a number', read(42)],
  ['read of a missing path field', { method: 'fs/read_text_file', params: { sessionId: SESSION } }],
  ['read of another session', { method: 'fs/read_text_file', params: { sessionId: 'other', path: '/workbench/sales-contracts/orders.odcs.yaml' } }],
  ['write to a server path', write('/etc/cron.d/x')],
  ['write with traversal', write('/workbench/sales-contracts/../x.yaml')],
  ['write to the git folder', write('/workbench/sales-contracts/.git/hooks/pre-commit')],
  ['write with encoded separators', write('/workbench/sales-contracts/%2Fx')],
  ['write without content', { method: 'fs/write_text_file', params: { sessionId: SESSION, path: '/workbench/sales-contracts/x.yaml' } }],
  ['write of another session', { method: 'fs/write_text_file', params: { sessionId: 'other', path: '/workbench/sales-contracts/x.yaml', content: 'a' } }],
  ['terminal create', { method: 'terminal/create', params: { sessionId: SESSION, command: 'rm', args: ['-rf', '/'] } }],
  ['terminal output', { method: 'terminal/output', params: { sessionId: SESSION, terminalId: 't' } }],
  ['terminal release', { method: 'terminal/release', params: { sessionId: SESSION, terminalId: 't' } }],
  ['terminal wait', { method: 'terminal/wait_for_exit', params: { sessionId: SESSION, terminalId: 't' } }],
  ['terminal kill', { method: 'terminal/kill', params: { sessionId: SESSION, terminalId: 't' } }],
  ['form request', { method: 'elicitation/create', params: { sessionId: SESSION } }],
  ['plan request', { method: 'workbench/plan', params: { sessionId: SESSION } }],
  ['context request', { method: 'workbench/context', params: { project: 'sales-contracts' } }],
  ['explain request', { method: 'workbench/explain', params: {} }],
  ['commit request', { method: 'workbench/commit', params: { message: 'x' } }],
  ['git commit request', { method: 'git/commit', params: { message: 'x', push: true } }],
  ['push request', { method: 'git/push', params: {} }],
  ['publish request', { method: 'workbench/publish', params: {} }],
  ['delete request', { method: 'fs/delete', params: { sessionId: SESSION, path: '/workbench/sales-contracts/orders.odcs.yaml' } }],
  ['move request', { method: 'fs/move', params: { sessionId: SESSION, from: '/workbench/a', to: '/workbench/b' } }],
  ['list request', { method: 'fs/list', params: { sessionId: SESSION, path: '/workbench' } }],
  ['authenticate request', { method: 'authenticate', params: { methodId: 'x' } }],
  ['session creation by the agent', { method: 'session/new', params: { cwd: '/', mcpServers: [] } }],
  ['prompt by the agent', { method: 'session/prompt', params: { sessionId: SESSION, prompt: [] } }],
  ['unknown method', { method: 'definitely/unknown', params: {} }],
  ['empty method', { method: '', params: {} }],
  ['method with a path in it', { method: '../../etc/passwd', params: {} }],
  ['extension request', { method: '_vendor/run', params: { command: 'ls' } }],
  ['request with no params', { method: 'terminal/create', params: undefined }],
];

for (const [name, request] of hostile) {
  test(`${name} changes nothing and runs nothing`, async () => {
    const { fixture, connection, sent, snapshot } = await harness();
    using _fixture = fixture;
    const before = snapshot();
    connection.receive(frame(1, request.method, request.params));
    await settle();
    expect(snapshot()).toEqual(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toHaveProperty('error');
  });
}

test('an oversize frame is refused without reading any file', async () => {
  const { fixture, connection, violations, snapshot } = await harness();
  using _fixture = fixture;
  const before = snapshot();
  connection.receive(frame(1, 'fs/write_text_file', { sessionId: SESSION, path: '/workbench/sales-contracts/big.yaml', content: 'x'.repeat(1_100_000) }));
  await settle();
  expect(violations).toEqual(['too-large']);
  expect(snapshot()).toEqual(before);
});

test('a flood of reads is limited and stays read-only', async () => {
  const { fixture, connection, sent, snapshot } = await harness();
  using _fixture = fixture;
  const before = snapshot();
  for (let id = 1; id <= 300; id++) connection.receive(frame(id, 'fs/read_text_file', { sessionId: SESSION, path: '/workbench/sales-contracts/orders.odcs.yaml' }));
  await settle();
  await Bun.sleep(200);
  const limited = sent.filter(message => (message.error as { message?: string } | undefined)?.message === 'Too many requests. Try again later.');
  expect(limited.length).toBeGreaterThan(100);
  const after = snapshot();
  expect(after.data).toBe(before.data);
  expect(after.git).toBe(before.git);
});

test('the table holds at least forty cases', () => {
  expect(hostile.length).toBeGreaterThanOrEqual(40);
});
