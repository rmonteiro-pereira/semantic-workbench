// The real relay program, hosting the scripted agent, carries a whole conversation: connecting, reading and writing a file, a question, cancelling and ending. It never listens on a port and never prints the capability.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PanelEvent } from '../../src/server/acp/panel-events';
import { startPanelServer, type PanelServer } from './helpers/panel-server';
import { startRelay } from './helpers/relay-process';

const PROJECT = 'mapped-commerce';
const FILE = 'commerce.mapped-ontology.yaml';
const VIRTUAL = `/workbench/${PROJECT}/${FILE}`;
let server: PanelServer;
beforeAll(async () => {
  server = await startPanelServer({ examples: ['mapped-commerce'] });
}, 120_000);
afterAll(async () => {
  await server.close();
});

const kinds = (events: PanelEvent[]) => events.map(event => event.type);
async function prompt(id: string, text: string, files: string[] = []) {
  return server.browser(`/api/acp/sessions/${id}/prompt`, { method: 'POST', json: { text, files } });
}
const disk = () => readFileSync(join(server.root, 'projects', PROJECT, FILE), 'utf8');

test('a conversation: connect, read, write, question, cancel, and the relay never listens or prints the capability', async () => {
  const { body } = await server.startSession(true);
  const relay = await startRelay(server, body, [
    [
      { say: 'Reading it.' },
      { plan: [{ content: 'Read the file' }, { content: 'Write a note' }] },
      { read: VIRTUAL, as: 'file' },
      { write: VIRTUAL, from: 'file', append: '# agent note\n' },
      { say: 'Done.' },
    ],
    [
      {
        ask: {
          title: 'Run a tool?',
          options: [
            { id: 'yes', name: 'Yes' },
            { id: 'no', name: 'No', kind: 'reject_once' },
          ],
        },
      },
      { say: 'Thanks.' },
    ],
    [{ sleep: 5000 }, { say: 'too late' }],
  ]);
  try {
    const connected = await server.readEvents(body.id, events => events.some(event => event.type === 'session' && event.state === 'connected'), 0, 30_000);
    expect(connected.find(event => event.type === 'session' && event.state === 'connected')).toMatchObject({ agentName: 'reference-agent' });
    expect(relay.listeningPorts()).toEqual([]);

    const original = disk();
    expect((await prompt(body.id, 'Please add a note')).status).toBe(202);
    const first = await server.readEvents(body.id, events => events.some(event => event.type === 'turn' && event.phase === 'finished'));
    expect(kinds(first)).toContain('tasks');
    const change = first.find(event => event.type === 'change');
    expect(change).toMatchObject({ card: { outcome: 'accepted', path: VIRTUAL, before: original } });
    expect(disk()).toBe(original + '# agent note\n');
    const text = first
      .filter(event => event.type === 'message' && event.role === 'agent')
      .map(event => (event as { text: string }).text)
      .join('');
    expect(text).toContain('Reading it.');
    expect(text).toContain('Done.');

    expect((await prompt(body.id, 'Ask me something')).status).toBe(202);
    const question = await server.readEvents(body.id, events => events.some(event => event.type === 'question' && !event.settled), first.at(-1)!.seq);
    const asked = question.find(event => event.type === 'question') as Extract<PanelEvent, { type: 'question' }>;
    expect(asked.question.options.map(option => option.id)).toEqual(['yes', 'no']);
    expect((await server.browser(`/api/acp/sessions/${body.id}/questions/${asked.question.id}`, { method: 'POST', json: { option: 'maybe' } })).status).toBe(400);
    expect((await server.browser(`/api/acp/sessions/${body.id}/questions/${asked.question.id}`, { method: 'POST', json: { option: 'yes' } })).status).toBe(200);
    const afterAnswer = await server.readEvents(body.id, events => events.some(event => event.type === 'turn' && event.phase === 'finished'), question.at(-1)!.seq);
    expect(kinds(afterAnswer)).toContain('turn');

    expect((await prompt(body.id, 'Wait a long time')).status).toBe(202);
    expect((await prompt(body.id, 'A second prompt in another tab')).status).toBe(409);
    await Bun.sleep(300);
    await server.browser(`/api/acp/sessions/${body.id}/cancel`, { method: 'POST', json: {} });
    const cancelled = await server.readEvents(body.id, events => events.some(event => event.type === 'turn' && event.phase === 'cancelled'), afterAnswer.at(-1)!.seq, 15_000);
    expect(cancelled.some(event => event.type === 'turn' && event.phase === 'cancelled')).toBe(true);

    // Nothing the relay or the agent printed, and nothing in the process arguments, holds the capability.
    const secret = server.capability();
    expect(relay.output()).not.toContain(secret);
    expect(relay.argv.join(' ')).not.toContain(secret);
    expect(JSON.stringify([...connected, ...first, ...question, ...afterAnswer, ...cancelled])).not.toContain(secret);

    await server.browser(`/api/acp/sessions/${body.id}`, { method: 'DELETE' });
    expect(await Promise.race([relay.child.exited, Bun.sleep(10_000).then(() => 'still running')])).not.toBe('still running');
  } finally {
    await relay.stop();
  }
}, 90_000);

test('an agent that exits ends the session with agent-exited', async () => {
  const { body } = await server.startSession(true);
  const relay = await startRelay(server, body, [[{ exit: 0 }]]);
  try {
    await server.readEvents(body.id, events => events.some(event => event.type === 'session' && event.state === 'connected'));
    await prompt(body.id, 'Go');
    const events = await server.readEvents(body.id, list => list.some(event => event.type === 'ended'), 0, 15_000);
    expect(events.find(event => event.type === 'ended')).toMatchObject({ reason: 'agent-exited' });
  } finally {
    await relay.stop();
  }
}, 60_000);

test('a wrong session code is refused and the relay says what to do', async () => {
  const { body } = await server.startSession(true);
  const relay = await startRelay(server, { id: body.id, code: 'ZZZZZZZZ' }, [[]]);
  try {
    expect(await Promise.race([relay.child.exited, Bun.sleep(10_000).then(() => 'still running')])).toBe(1);
    expect(relay.output()).toContain('did not accept the session');
  } finally {
    await relay.stop();
    await server.browser(`/api/acp/sessions/${body.id}`, { method: 'DELETE' });
  }
}, 30_000);
