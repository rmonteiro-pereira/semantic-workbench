// The scripted agent speaks the verified protocol subset over pipes and uses only the abilities the client advertised.
import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchesDefinition } from '../../src/server/acp/protocol-schema';
import type { Script } from '../../scripts/acp-reference-agent';

type Message = Record<string, any>;
const folders: string[] = [];
afterEach(() => folders.splice(0).forEach(folder => rmSync(folder, { recursive: true, force: true })));

/** Starts the agent on a script and returns a small client that drives it. */
function start(script: Script) {
  const folder = mkdtempSync(join(tmpdir(), 'acp-agent-'));
  folders.push(folder);
  const path = join(folder, 'script.json');
  writeFileSync(path, JSON.stringify(script));
  const child = Bun.spawn(['bun', 'scripts/acp-reference-agent.ts', path], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
  const inbox: Message[] = [];
  let buffer = '';
  (async () => {
    const decoder = new TextDecoder();
    for await (const chunk of child.stdout) {
      buffer += decoder.decode(chunk);
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        inbox.push(JSON.parse(buffer.slice(0, newline)));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    }
  })();
  const send = (message: Message) => {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
    child.stdin.flush();
  };
  async function next(match: (message: Message) => boolean): Promise<Message> {
    for (let attempt = 0; attempt < 400; attempt++) {
      const index = inbox.findIndex(match);
      if (index >= 0) return inbox.splice(index, 1)[0];
      await Bun.sleep(10);
    }
    throw new Error('The agent did not answer.');
  }
  return { child, inbox, send, next };
}

const capabilities = { fs: { readTextFile: true, writeTextFile: true }, terminal: false };

async function handshake(agent: ReturnType<typeof start>, advertised: object = capabilities) {
  agent.send({ id: 1, method: 'initialize', params: { protocolVersion: 1, clientCapabilities: advertised } });
  const initialized = await agent.next(message => message.id === 1);
  agent.send({ id: 2, method: 'session/new', params: { cwd: '/workbench', mcpServers: [] } });
  const created = await agent.next(message => message.id === 2);
  return { initialized, created };
}

test('the handshake answers match the protocol schema and no tool server is requested', async () => {
  const agent = start([[]]);
  const { initialized, created } = await handshake(agent);
  expect(matchesDefinition('InitializeResponse', initialized.result)).toBe(true);
  expect(matchesDefinition('NewSessionResponse', created.result)).toBe(true);
  agent.child.kill();
});

test('a turn sends updates, reads, writes and asks, each frame valid against the schema', async () => {
  const agent = start([
    [
      { say: 'hello' },
      { think: 'hm' },
      { tool: 'Look' },
      { plan: [{ content: 'one' }] },
      { read: '/workbench/p/a.yaml', as: 'a' },
      { write: '/workbench/p/a.yaml', from: 'a', append: '# x\n' },
      { ask: { title: 'Go on?', options: [{ id: 'y', name: 'Yes' }] } },
    ],
  ]);
  await handshake(agent);
  agent.send({ id: 3, method: 'session/prompt', params: { sessionId: 'reference-session', prompt: [{ type: 'text', text: 'go' }] } });
  const read = await agent.next(message => message.method === 'fs/read_text_file');
  expect(matchesDefinition('ReadTextFileRequest', read.params)).toBe(true);
  agent.send({ id: read.id, result: { content: 'text\n' } });
  const write = await agent.next(message => message.method === 'fs/write_text_file');
  expect(matchesDefinition('WriteTextFileRequest', write.params)).toBe(true);
  expect(write.params.content).toBe('text\n# x\n');
  agent.send({ id: write.id, result: {} });
  const ask = await agent.next(message => message.method === 'session/request_permission');
  expect(matchesDefinition('RequestPermissionRequest', ask.params)).toBe(true);
  agent.send({ id: ask.id, result: { outcome: { outcome: 'selected', optionId: 'y' } } });
  const finished = await agent.next(message => message.id === 3);
  expect(matchesDefinition('PromptResponse', finished.result)).toBe(true);
  const updates = agent.inbox.filter(message => message.method === 'session/update');
  expect(updates.length).toBeGreaterThanOrEqual(5);
  for (const update of updates) expect(matchesDefinition('SessionNotification', update.params)).toBe(true);
  agent.child.kill();
});

test('without the advertised abilities the agent sends no file request', async () => {
  const agent = start([[{ read: '/workbench/p/a.yaml' }, { write: '/workbench/p/a.yaml', content: 'x' }]]);
  await handshake(agent, { fs: { readTextFile: false, writeTextFile: false }, terminal: false });
  agent.send({ id: 3, method: 'session/prompt', params: { sessionId: 'reference-session', prompt: [] } });
  const finished = await agent.next(message => message.id === 3);
  expect(finished.result.stopReason).toBe('end_turn');
  expect(agent.inbox.some(message => message.method?.startsWith('fs/'))).toBe(false);
  agent.child.kill();
});

test('a cancel stops the turn with the cancelled stop reason and the agent exits on request', async () => {
  const agent = start([[{ sleep: 300 }, { say: 'late' }], [{ exit: 3 }]]);
  await handshake(agent);
  agent.send({ id: 3, method: 'session/prompt', params: { sessionId: 'reference-session', prompt: [] } });
  await Bun.sleep(50);
  agent.send({ method: 'session/cancel', params: { sessionId: 'reference-session' } });
  expect((await agent.next(message => message.id === 3)).result.stopReason).toBe('cancelled');
  agent.send({ id: 4, method: 'session/prompt', params: { sessionId: 'reference-session', prompt: [] } });
  expect(await agent.child.exited).toBe(3);
});
