// A permission question is answered once from the offered options, is cancelled when nobody answers, and never widens what the boundary allows.
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createHandler } from '../../src/server/handler';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createAuditLog } from '../../src/server/auth/audit';
import { INCOMING_PARAM_SCHEMAS, createClientSurface } from '../../src/server/acp/client-surface';
import { mintAcpCaller } from '../../src/server/acp/connection-auth';
import { createFileRequests } from '../../src/server/acp/file-requests';
import { createJsonRpcConnection } from '../../src/server/acp/jsonrpc-connection';
import type { PanelEventBody } from '../../src/server/acp/panel-events';
import { MAXIMUM_PENDING_QUESTIONS, MAXIMUM_QUESTION_OPTIONS, QUESTION_TIMEOUT_MS, createPermissionQuestions } from '../../src/server/acp/permission-questions';
import { createVersionRecords } from '../../src/server/acp/version-records';
import { authWorkspace } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { accessFixture, person } from '../auth/access-fixture';

const request = (title = 'Run a tool', names = ['Allow once', 'Always allow', 'Reject']) => ({ toolCall: { title }, options: names.map((name, index) => ({ optionId: `o${index}`, name })) });

function desk(options: { timeoutMs?: number } = {}) {
  const events: PanelEventBody[] = [];
  const timers: { run: () => void; afterMs: number; stopped: boolean }[] = [];
  const questions = createPermissionQuestions({
    emit: event => events.push(event),
    timeoutMs: options.timeoutMs,
    schedule: (run, afterMs) => {
      const timer = { run, afterMs, stopped: false };
      timers.push(timer);
      return () => (timer.stopped = true);
    },
  });
  return { questions, events, timers };
}

test('a question is shown with its options as plain text and answered once with an offered option', async () => {
  const { questions, events } = desk();
  const outcome = questions.ask(request('<b>Run</b> a tool'));
  expect(events[0]).toMatchObject({ type: 'question', question: { id: 'q1', text: '<b>Run</b> a tool', options: [{ id: 'o0', label: 'Allow once' }, { id: 'o1' }, { id: 'o2' }] } });
  expect(questions.answer('q1', { option: 'o2' })).toBe('answered');
  expect(await outcome).toEqual({ outcome: 'selected', optionId: 'o2' });
  expect(questions.answer('q1', { option: 'o0' })).toBe('unknown-question');
  expect(events.at(-1)).toMatchObject({ type: 'question', settled: true });
});

test('an option that was not offered is refused and the question stays open', async () => {
  const { questions } = desk();
  const outcome = questions.ask(request());
  expect(questions.answer('q1', { option: 'o9' })).toBe('unknown-option');
  expect(questions.pendingCount).toBe(1);
  questions.answer('q1', { cancel: true });
  expect(await outcome).toEqual({ outcome: 'cancelled' });
});

test('only the first eight options are shown and only those can be chosen', async () => {
  const { questions, events } = desk();
  const names = Array.from({ length: 12 }, (_unused, index) => `Option number ${index} with a long label `.repeat(5));
  const outcome = questions.ask(request('Many', names));
  expect(events[0].type === 'question' && events[0].question.options).toHaveLength(MAXIMUM_QUESTION_OPTIONS);
  expect(questions.answer('q1', { option: 'o10' })).toBe('unknown-option');
  questions.cancelAll();
  expect(await outcome).toEqual({ outcome: 'cancelled' });
});

test('a sixth waiting question is cancelled at once and never shown', async () => {
  const { questions, events } = desk();
  for (let index = 0; index < MAXIMUM_PENDING_QUESTIONS; index++) void questions.ask(request());
  const shown = events.length;
  expect(await questions.ask(request())).toEqual({ outcome: 'cancelled' });
  expect(events).toHaveLength(shown);
  questions.cancelAll();
});

test('a question nobody answers is cancelled after the timeout and the timer stops once it is answered', async () => {
  const { questions, timers } = desk();
  const slow = questions.ask(request());
  const quick = questions.ask(request());
  expect(timers[0].afterMs).toBe(QUESTION_TIMEOUT_MS);
  timers[0].run();
  expect(await slow).toEqual({ outcome: 'cancelled' });
  questions.answer('q2', { option: 'o0' });
  expect(timers[1].stopped).toBe(true);
  expect(await quick).toEqual({ outcome: 'selected', optionId: 'o0' });
});

test('cancelling the turn or ending the session answers every waiting question cancelled', async () => {
  const { questions } = desk();
  const first = questions.ask(request());
  const second = questions.ask(request());
  questions.cancelAll();
  expect(await Promise.all([first, second])).toEqual([{ outcome: 'cancelled' }, { outcome: 'cancelled' }]);
  expect(questions.pendingCount).toBe(0);
});

test('choosing always allow changes nothing the boundary decides: a refused write stays refused', async () => {
  const fixture = await authWorkspace();
  using _fixture = fixture;
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('carol'));
  const audit = createAuditLog({ dir: join(fixture.root, 'panel-audit') });
  const handler = createHandler(fixture.ws, { mode: 'server', access, audit, principal: () => principal, publicOrigin: 'http://localhost:5312', port: 5312, remoteCredentials: allowEveryRemote() });
  const caller = mintAcpCaller({ principal, connection: 'acp-question', scope: ['read', 'localWrite'] });
  const events: PanelEventBody[] = [];
  const files = createFileRequests({
    operate: async call => (await handler.boundary.operate({ caller, request: call })).response,
    versions: createVersionRecords(),
    admit: () => ({ ok: true, release() {} }),
  });
  const questions = createPermissionQuestions({ emit: event => events.push(event) });
  const surface = createClientSurface({ files, questions, emit: event => events.push(event), agentSessionId: () => 'S' });
  const sent: Record<string, unknown>[] = [];
  const connection = createJsonRpcConnection({
    send: message => sent.push(message),
    handleRequest: surface.handleRequest,
    handleNotification: surface.handleNotification,
    onViolation: () => {},
    paramSchemas: INCOMING_PARAM_SCHEMAS,
  });
  const send = (id: number, method: string, params: unknown) => connection.receive(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  const write = { sessionId: 'S', path: '/workbench/sales-contracts/orders.odcs.yaml', content: 'x: 1\n' };

  send(1, 'fs/write_text_file', write);
  await Bun.sleep(100);
  expect(sent[0]).toHaveProperty('error');

  send(2, 'session/request_permission', { sessionId: 'S', toolCall: { toolCallId: 't1', title: 'Write the file' }, options: [{ optionId: 'always', name: 'Always allow', kind: 'allow_always' }] });
  await Bun.sleep(20);
  expect(questions.answer('q1', { option: 'always' })).toBe('answered');
  await Bun.sleep(20);
  expect(sent[1]).toMatchObject({ id: 2, result: { outcome: { outcome: 'selected', optionId: 'always' } } });

  send(3, 'fs/write_text_file', write);
  await Bun.sleep(100);
  expect(sent[2]).toHaveProperty('error');
});
