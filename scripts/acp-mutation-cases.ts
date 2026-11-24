// Focused behavioural assertions for candidate panel modules, using their public entry points.
import assert from 'node:assert/strict';
import { mintCaller } from '../src/server/auth/caller';
import { sessionFor } from '../tests/connections/connection-fixture';
import { localPrincipal } from '../src/server/auth/principal';
import { createVersionRecords } from '../src/server/acp/version-records';
import type { AuditInput, AuditLog } from '../src/server/auth/audit';
import type { OperationBoundary } from '../src/server/auth/operation-boundary';

async function fileCases(module: typeof import('../src/server/acp/file-requests')) {
  const versions = createVersionRecords();
  let reads = 0;
  let savedBase: unknown;
  let currentHash = 'old';
  let status = 200;
  const files = module.createFileRequests({
    versions,
    admit: () => ({ ok: true, release() {} }),
    operate: async request => {
      if (request.method === 'GET') {
        reads++;
        return Response.json({ hash: currentHash, source: 'old' }, { status });
      }
      const body = await request.json();
      savedBase = body.baseHash;
      return Response.json({ hash: 'saved' });
    },
  });
  const path = '/workbench/example/file.yaml';
  assert.deepEqual(await files.write({ path, content: 'new' }), {
    ok: false,
    failure: { reason: 'unread', message: 'Read the file first, then write it.', card: { id: 1, path, outcome: 'refused', reason: 'unread' } },
  });
  await files.read({ path });
  currentHash = 'changed';
  assert.equal((await files.write({ path, content: 'new' })).ok, false);
  currentHash = 'old';
  await files.write({ path, content: 'new' });
  assert.equal(savedBase, 'old');
  assert.equal(reads, 4);
  status = 403;
  const hidden = await files.read({ path });
  status = 404;
  assert.deepEqual(await files.read({ path }), hidden);
}

async function mountCases(module: typeof import('../src/server/acp/mount')) {
  const principal = localPrincipal();
  let origin: 'mcp' | 'acp' = 'mcp';
  const mounted = module.mountAgentPanel({
    mode: 'server',
    port: 5418,
    publicOrigin: 'https://workbench.test',
    audit: { append() {} } as unknown as AuditLog,
    boundary: () => ({}) as OperationBoundary,
    connections: {
      createConnectionForSession: () => ({ ok: true, credential: 'setup', expiresAt: Date.now() + 60_000 }),
      resolve: async () => ({ ok: true, caller: mintCaller({ principal, origin, connection: 'connection', scope: ['read'] }), connection: 'connection' }),
      onConnectionEnded: () => () => {},
    },
  });
  assert.ok(mounted);
  try {
    const started = await mounted.service.start({ principal, session: sessionFor('browser', principal) });
    assert.ok(started.ok);
    const request = new Request('https://workbench.test', { headers: { Authorization: 'Bearer token' } });
    assert.equal(await mounted.service.relayFor(request, started.session.id), undefined);
    origin = 'acp';
    assert.ok(await mounted.service.relayFor(request, started.session.id));
    const browser = new Request('https://workbench.test', { headers: { Origin: 'https://workbench.test', Authorization: 'Bearer token' } });
    assert.equal(await mounted.service.relayFor(browser, started.session.id), undefined);
  } finally {
    mounted.service.stopSweeper();
  }
}

async function serviceCases(module: typeof import('../src/server/acp/panel-service')) {
  const records: AuditInput[] = [];
  const service = module.createPanelService({
    mode: 'local',
    workbenchUrl: 'http://localhost',
    audit: { append: input => records.push(input) } as unknown as AuditLog,
    boundary: () => ({}) as OperationBoundary,
    authenticateRelay: async () => ({ ok: true, principal: localPrincipal() }),
  });
  const started = await service.start({ principal: localPrincipal() });
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const session = service.store.findForRelay(started.session.id)!;
  session.buffer.append({ type: 'message', id: 'm', role: 'user', done: true, text: 'audit-content-canary' });
  service.end(session, 'revoked');
  assert.equal(await service.relayFor(new Request('http://localhost'), session.id), undefined);
  assert.equal(records.length, 2);
  assert.ok(records.every(record => record.origin === 'acp'));
  assert.ok(!JSON.stringify(records).includes('audit-content-canary'));
  assert.equal(records[1].reason, 'revoked');
}

/** Runs the behavioural case for one candidate module. */
export async function acpMutationCase(target: string, category: string): Promise<void> {
  const module = await import(target);
  if (category === 'acp-mount') return mountCases(module);
  else if (category === 'acp-files') return fileCases(module);
  if (category === 'acp-service') return serviceCases(module);
  if (category === 'acp-path') {
    assert.equal(module.parseVirtualPath('/elsewhere/example/file.yaml').ok, false);
    assert.equal(module.parseVirtualPath('/workbench/example/../secret').ok, false);
    assert.equal(module.parseVirtualPath('/workbench/example/file.yaml').ok, true);
  } else if (category === 'acp-sessions') {
    let now = 0;
    const store = module.createSessionStore({ now: () => now });
    const { session } = store.create({ owner: 'one', scope: ['read'] });
    assert.equal(store.find(session.id, 'other'), undefined);
    const code = session.code;
    assert.equal(store.consumeCode(session, code), true);
    assert.equal(store.consumeCode(session, code), false);
    store.end(session, 'closed');
    const next = store.create({ owner: 'one', scope: ['read'] }).session;
    now = 600_001;
    assert.equal(store.consumeCode(next, next.code), false);
  } else if (category === 'acp-state') {
    const ended = module.applyEvent(module.newPanelSession(0), { type: 'end', reason: 'revoked' }, 1);
    assert.equal(ended.endReason, 'revoked');
    assert.equal(ended.state, 'ended');
  } else if (category === 'acp-link') {
    const link = module.createFrameLink({ now: () => 0 });
    assert.equal(link.accept(1), 'accepted');
    assert.equal(link.accept(1), 'duplicate');
  } else if (category === 'acp-flood') {
    let now = 0;
    const guard = module.createFloodGuard({ now: () => now });
    let flood = false;
    for (let tick = 0; tick < 60; tick++) {
      now = tick * 100;
      for (let call = 0; call < 50; call++) {
        const result = guard.admit();
        if (result.ok) result.permit.release();
        else flood ||= result.flood;
      }
    }
    assert.equal(flood, true);
  } else if (category === 'acp-protocol') {
    const violations: string[] = [];
    const rpc = module.createJsonRpcConnection({ send() {}, handleRequest: async () => ({}), handleNotification() {}, onViolation: (reason: string) => violations.push(reason), paramSchemas: {} });
    rpc.receive('x'.repeat(module.MAXIMUM_FRAME_BYTES + 1));
    assert.deepEqual(violations, ['too-large']);
    rpc.close();
  } else if (category === 'acp-questions') {
    const events: { question: { id: string } }[] = [];
    const questions = module.createPermissionQuestions({ emit: (event: never) => events.push(event) });
    const pending = questions.ask({ toolCall: { title: 'Continue?' }, options: [{ optionId: 'yes', name: 'Yes' }] });
    assert.equal(questions.answer(events[0].question.id, { option: 'other' }), 'unknown-option');
    questions.cancelAll();
    await pending;
  } else if (category === 'acp-surface') {
    const surface = module.createClientSurface({ files: {}, questions: {}, emit() {}, agentSessionId: () => 'agent' });
    await assert.rejects(surface.handleRequest('terminal/create', {}), /Method not found/);
  } else if (category === 'acp-conversation') {
    const { createSessionStore } = await import('../src/server/acp/session-store');
    const frames: Record<string, unknown>[] = [];
    const store = createSessionStore({ now: () => 0 });
    const created = store.create({ owner: 'one', scope: ['read'] });
    if (!created.ok) throw new Error('Session not created.');
    const conversation = module.createConversation({
      session: created.session,
      store,
      boundary: {},
      caller() {},
      now: () => 0,
      publish() {},
      clientName: 'test',
      sendToAgent: (line: string) => {
        frames.push(JSON.parse(line));
        return true;
      },
    });
    const opening = conversation.start();
    assert.equal((frames[0].params as { clientCapabilities: { terminal: boolean } }).clientCapabilities.terminal, false);
    conversation.close('closed');
    await opening;
  } else throw new Error(`Unknown panel mutation category: ${category}`);
}
