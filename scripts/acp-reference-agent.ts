// A scripted agent for tests. It speaks the Agent Client Protocol over standard input and output, one message per line, and does what a JSON script tells it. It is a test fixture, not a supported agent.
// Usage: bun scripts/acp-reference-agent.ts <script.json>. The script is a list of turns; each prompt runs the next turn, and the last turn repeats.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

/** One thing the agent does during a turn. */
export type ScriptStep =
  | { say: string }
  | { think: string }
  | { tool: string }
  | { plan: { content: string; status?: string; priority?: string }[] }
  | { read: string; line?: number; limit?: number; as?: string }
  | { write: string; content?: string; append?: string; from?: string }
  | { ask: { title: string; options: { id: string; name: string; kind?: string }[] } }
  | { huge: number }
  | { flood: number; path: string }
  | { unsupported: string }
  | { sleep: number }
  | { exit: number };

/** The turns of a script. */
export type Script = ScriptStep[][];

type Pending = { resolve(value: { result?: unknown; error?: { code: number; message: string } }): void };

const script: Script = JSON.parse(readFileSync(process.argv[2] ?? '', 'utf8'));
const pending = new Map<number, Pending>();
const reads = new Map<string, string>();
let nextRequestId = 1000;
let clientCapabilities: { fs?: { readTextFile?: boolean; writeTextFile?: boolean } } = {};
let sessionId = '';
let turnIndex = 0;
let cancelled = false;

function send(message: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
}

function log(event: Record<string, unknown>): void {
  process.stderr.write(JSON.stringify(event) + '\n');
}

function request(method: string, params: Record<string, unknown>): Promise<{ result?: unknown; error?: { code: number; message: string } }> {
  const id = nextRequestId++;
  send({ id, method, params });
  return new Promise(resolve => pending.set(id, { resolve }));
}

function update(body: Record<string, unknown>): void {
  send({ method: 'session/update', params: { sessionId, update: body } });
}

async function runStep(step: ScriptStep): Promise<void> {
  if ('say' in step) return update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: step.say } });
  if ('think' in step) return update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: step.think } });
  if ('huge' in step) return update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'x'.repeat(step.huge) } });
  if ('plan' in step) return update({ sessionUpdate: 'plan', entries: step.plan.map(entry => ({ content: entry.content, status: entry.status ?? 'pending', priority: entry.priority ?? 'medium' })) });
  if ('tool' in step) {
    update({ sessionUpdate: 'tool_call', toolCallId: 't1', title: step.tool, status: 'in_progress' });
    return update({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' });
  }
  if ('sleep' in step) return void (await new Promise(resolve => setTimeout(resolve, step.sleep)));
  if ('exit' in step) process.exit(step.exit);
  if ('unsupported' in step) {
    const answer = await request(step.unsupported, { sessionId });
    return log({ step: 'unsupported', method: step.unsupported, error: answer.error });
  }
  if ('flood' in step) {
    const answers = await Promise.all(Array.from({ length: step.flood }, () => request('fs/read_text_file', { sessionId, path: step.path })));
    return log({ step: 'flood', errors: answers.filter(answer => answer.error).length });
  }
  if ('ask' in step) {
    const options = step.ask.options.map(option => ({ optionId: option.id, name: option.name, kind: option.kind ?? 'allow_once' }));
    const answer = await request('session/request_permission', { sessionId, toolCall: { toolCallId: 't-ask', title: step.ask.title }, options });
    return log({ step: 'ask', answer: answer.result ?? answer.error });
  }
  if ('read' in step) {
    // An agent may only use what the client advertised.
    if (!clientCapabilities.fs?.readTextFile) return log({ step: 'read', skipped: 'not advertised' });
    const answer = await request('fs/read_text_file', { sessionId, path: step.read, ...(step.line ? { line: step.line } : {}), ...(step.limit ? { limit: step.limit } : {}) });
    const content = (answer.result as { content?: string } | undefined)?.content;
    if (content !== undefined) reads.set(step.as ?? step.read, content);
    return log({ step: 'read', path: step.read, ok: content !== undefined, length: content?.length, error: answer.error });
  }
  if ('write' in step) {
    if (!clientCapabilities.fs?.writeTextFile) return log({ step: 'write', skipped: 'not advertised' });
    const base = step.from ? (reads.get(step.from) ?? '') : '';
    const content = step.content ?? base + (step.append ?? '');
    const answer = await request('fs/write_text_file', { sessionId, path: step.write, content });
    return log({ step: 'write', path: step.write, ok: !answer.error, error: answer.error });
  }
}

async function runTurn(): Promise<string> {
  const steps = script[Math.min(turnIndex, script.length - 1)] ?? [];
  turnIndex += 1;
  cancelled = false;
  for (const step of steps) {
    if (cancelled) return 'cancelled';
    await runStep(step);
  }
  return cancelled ? 'cancelled' : 'end_turn';
}

async function handle(message: Record<string, unknown>): Promise<void> {
  const { id, method, params } = message as { id?: number; method?: string; params?: Record<string, unknown> };
  if (method === undefined && id !== undefined) return void pending.get(id)?.resolve(message as never);
  if (method === 'initialize') {
    clientCapabilities = (params?.clientCapabilities as typeof clientCapabilities) ?? {};
    return send({ id, result: { protocolVersion: 1, agentCapabilities: {}, agentInfo: { name: 'reference-agent', version: '1.0.0' } } });
  }
  if (method === 'session/new') {
    sessionId = 'reference-session';
    log({ step: 'session/new', cwd: params?.cwd, mcpServers: params?.mcpServers });
    return send({ id, result: { sessionId } });
  }
  if (method === 'session/prompt') return send({ id, result: { stopReason: await runTurn() } });
  if (method === 'session/cancel') {
    cancelled = true;
    return;
  }
  if (id !== undefined) send({ id, error: { code: -32601, message: 'Method not found.' } });
}

const lines = createInterface({ input: process.stdin });
lines.on('line', line => {
  if (line.trim()) void handle(JSON.parse(line));
});
lines.on('close', () => process.exit(0));
