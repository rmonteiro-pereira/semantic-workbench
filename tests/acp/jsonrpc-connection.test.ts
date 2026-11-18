// The connection matches replies to requests and refuses frames that are oversize, unmatched, duplicated, batched or against the schema.
import { expect, test } from 'bun:test';
import { JsonRpcError, RPC_ERROR, createJsonRpcConnection, type Violation } from '../../src/server/acp/jsonrpc-connection';

function harness(handle: (method: string, params: unknown) => Promise<unknown> = async () => ({})) {
  const sent: Record<string, unknown>[] = [];
  const violations: Violation[] = [];
  const notifications: [string, unknown][] = [];
  const connection = createJsonRpcConnection({
    send: message => sent.push(message),
    handleRequest: handle,
    handleNotification: (method, params) => notifications.push([method, params]),
    onViolation: violation => violations.push(violation),
    paramSchemas: { 'fs/read_text_file': 'ReadTextFileRequest', 'session/update': 'SessionNotification' },
    maximumFrameBytes: 2000,
  });
  return { connection, sent, violations, notifications };
}
const frame = (value: unknown) => JSON.stringify(value);
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('a reply resolves the request with the matching id', async () => {
  const { connection, sent } = harness();
  const answer = connection.request('session/prompt', { sessionId: 's', prompt: [] }, 'PromptResponse');
  expect(sent[0]).toMatchObject({ jsonrpc: '2.0', id: 1, method: 'session/prompt' });
  connection.receive(frame({ jsonrpc: '2.0', id: 1, result: { stopReason: 'end_turn' } }));
  expect(await answer).toEqual({ stopReason: 'end_turn' });
  expect(connection.pendingCount).toBe(0);
});

test('an error reply rejects with the agent code', async () => {
  const { connection } = harness();
  const answer = connection.request('session/prompt', {}, 'PromptResponse');
  connection.receive(frame({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'sign in first' } }));
  await expect(answer).rejects.toMatchObject({ code: -32000 });
});

test('a reply that fails the schema is refused and rejects', async () => {
  const { connection, violations } = harness();
  const answer = connection.request('session/prompt', {}, 'PromptResponse');
  connection.receive(frame({ jsonrpc: '2.0', id: 1, result: { stopReason: 'surprise' } }));
  await expect(answer).rejects.toBeInstanceOf(JsonRpcError);
  expect(violations).toEqual(['schema']);
});

test('an unmatched reply and a repeated reply are violations', async () => {
  const { connection, violations } = harness();
  connection.receive(frame({ jsonrpc: '2.0', id: 99, result: {} }));
  const answer = connection.request('session/prompt', {}, 'PromptResponse');
  connection.receive(frame({ jsonrpc: '2.0', id: 1, result: { stopReason: 'end_turn' } }));
  await answer;
  connection.receive(frame({ jsonrpc: '2.0', id: 1, result: { stopReason: 'end_turn' } }));
  expect(violations).toEqual(['unmatched-reply', 'duplicate-reply']);
});

test('a request from the agent is answered with the handler result', async () => {
  const { connection, sent } = harness(async () => ({ content: 'hello' }));
  connection.receive(frame({ jsonrpc: '2.0', id: 'a', method: 'fs/read_text_file', params: { sessionId: 's', path: '/workbench/p/f' } }));
  await settle();
  expect(sent).toEqual([{ jsonrpc: '2.0', id: 'a', result: { content: 'hello' } }]);
});

test('a handler error becomes an error reply and an unexpected failure hides its message', async () => {
  const known = harness(async () => {
    throw new JsonRpcError(RPC_ERROR.methodNotFound, 'Method not found.');
  });
  known.connection.receive(frame({ jsonrpc: '2.0', id: 1, method: 'terminal/create', params: {} }));
  await settle();
  expect(known.sent[0]).toMatchObject({ id: 1, error: { code: -32601 } });
  const unknown = harness(async () => {
    throw new Error('secret path /srv/data');
  });
  unknown.connection.receive(frame({ jsonrpc: '2.0', id: 1, method: 'x', params: {} }));
  await settle();
  expect(JSON.stringify(unknown.sent)).not.toContain('secret');
});

test('params that fail the schema get an invalid params error and a violation, and the handler is not called', async () => {
  let called = false;
  const { connection, sent, violations } = harness(async () => {
    called = true;
    return {};
  });
  connection.receive(frame({ jsonrpc: '2.0', id: 1, method: 'fs/read_text_file', params: { sessionId: 's' } }));
  await settle();
  expect(called).toBe(false);
  expect(sent[0]).toMatchObject({ error: { code: -32602 } });
  expect(violations).toEqual(['schema']);
});

test('a repeated id of an unanswered request is a violation', async () => {
  let release: (value: unknown) => void = () => {};
  const { connection, violations } = harness(() => new Promise(resolve => (release = resolve)));
  const request = { jsonrpc: '2.0', id: 7, method: 'other', params: {} };
  connection.receive(frame(request));
  connection.receive(frame(request));
  expect(violations).toEqual(['duplicate-id']);
  release({});
});

test('oversize frames, text that is not JSON, batches and non JSON-RPC are refused', () => {
  const { connection, violations, notifications } = harness();
  connection.receive('x'.repeat(2001));
  connection.receive('{not json');
  connection.receive(frame([{ jsonrpc: '2.0', method: 'a' }]));
  connection.receive(frame({ id: 1, method: 'a' }));
  connection.receive(frame({ jsonrpc: '2.0', id: 1.5, method: 'a' }));
  connection.receive(frame('text'));
  expect(violations).toEqual(['too-large', 'not-json', 'batch', 'not-jsonrpc', 'not-jsonrpc', 'not-jsonrpc']);
  expect(notifications).toEqual([]);
});

test('a notification is checked and passed on', () => {
  const { connection, notifications, violations } = harness();
  const update = { sessionId: 's', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hi' } } };
  connection.receive(frame({ jsonrpc: '2.0', method: 'session/update', params: update }));
  connection.receive(frame({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 's' } }));
  connection.receive(frame({ jsonrpc: '2.0', method: 'unlisted/notice', params: { a: 1 } }));
  expect(notifications.map(item => item[0])).toEqual(['session/update', 'unlisted/notice']);
  expect(violations).toEqual(['schema']);
});

test('closing rejects waiting requests and stops all traffic', async () => {
  const { connection, sent, violations } = harness();
  const answer = connection.request('session/prompt', {}, 'PromptResponse');
  connection.close();
  await expect(answer).rejects.toThrow('ended');
  const before = sent.length;
  connection.notify('session/cancel', { sessionId: 's' });
  connection.receive('garbage');
  expect(sent.length).toBe(before);
  expect(violations).toEqual([]);
});
