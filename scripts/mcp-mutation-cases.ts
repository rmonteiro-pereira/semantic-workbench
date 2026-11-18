// Focused assertions for the agent endpoint's mutants. Each case imports the modules of a mutated copy and checks one guarantee with plain fakes, so a fault in the copy makes an assertion fail.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The copied folder a mutant of a module under `src/server/mcp` runs in. */
function treeOf(target: string): string {
  const tree = target.match(/^(.*-tree)\//)?.[1];
  if (!tree) throw new Error('The mutant is not inside a copied folder.');
  return tree;
}

const OWN = { port: 4310, capabilityMatches: (value: string | null) => value === 'secret' };
const GOOD = { method: 'POST', origin: null, host: '127.0.0.1:4310', authorization: 'Bearer secret', contentType: 'application/json' };

/** The access checks: each refusal still happens, in the documented order. */
export async function mcpGateCase(target: string) {
  const { decideRequest } = await import(join(treeOf(target), 'request-gate.ts'));
  assert.deepEqual(decideRequest(GOOD, OWN), { allow: true });
  assert.equal(decideRequest({ ...GOOD, authorization: 'Bearer wrong' }, OWN).status, 401);
  assert.equal(decideRequest({ ...GOOD, authorization: null }, OWN).status, 401);
  assert.equal(decideRequest({ ...GOOD, origin: 'http://127.0.0.1:5173' }, OWN).status, 403);
  assert.equal(decideRequest({ ...GOOD, origin: 'null' }, OWN).status, 403);
  assert.equal(decideRequest({ ...GOOD, host: 'localhost.evil.example' }, OWN).status, 403);
  assert.equal(decideRequest({ ...GOOD, host: '127.0.0.1:4311' }, OWN).status, 403);
  assert.equal(decideRequest({ ...GOOD, method: 'GET' }, OWN).status, 405);
  assert.equal(decideRequest({ ...GOOD, contentType: 'text/plain' }, OWN).status, 415);
}

/** Cursors, receipts and the result cap. */
export async function mcpStateCase(target: string) {
  const tree = treeOf(target);
  const { createCursorCodec } = await import(join(tree, 'cursors.ts'));
  const binding = { query: 'q', ordering: 'o', generation: 'g', principal: 'one' };
  const codec = createCursorCodec();
  const cursor = codec.issue(5, binding);
  assert.equal(codec.open(cursor, binding), 5);
  assert.equal(codec.open(cursor, { ...binding, principal: 'two' }), null);
  assert.equal(codec.open(cursor, { ...binding, query: 'other' }), null);
  assert.equal(codec.open(cursor, { ...binding, generation: 'changed' }), null);
  const { byteRange, RESULT_CAP_BYTES } = await import(join(tree, 'tool-results.ts'));
  assert.ok(Buffer.byteLength(byteRange('a'.repeat(RESULT_CAP_BYTES * 3), 0, RESULT_CAP_BYTES * 3).text) <= RESULT_CAP_BYTES);
  assert.equal(byteRange('€'.repeat(40_000), 0, 1_000_000).nextOffset! % 3, 0);
  const { createReceiptStore } = await import(join(tree, 'receipts.ts'));
  const store = createReceiptStore(join(mkdtempSync(join(tmpdir(), 'mutant-receipts-')), 'receipts'));
  let effects = 0;
  const request = (args: Record<string, unknown>) => ({
    principalId: 'local',
    tool: 'delete_file',
    idempotencyKey: 'mutant-key-0000000001',
    args,
    effect: async () => (effects++, { ok: true as const, data: { n: effects } }),
    verify: async () => null,
  });
  const first = await store.run(request({ a: 1 }));
  assert.deepEqual(await store.run(request({ a: 1 })), first);
  assert.equal(effects, 1);
  const reused = await store.run(request({ a: 2 }));
  assert.equal(reused.ok, false);
  assert.equal(reused.error.code, 'key_reused');
  assert.equal(effects, 1);
}

const EXPECTED_OPERATIONS: Record<string, string> = {
  create_file: 'files.save',
  delete_file: 'files.delete',
  explain_metric: 'metrics.explain',
  get_findings: 'files.read',
  get_mapping_catalog: 'agent.catalog.read',
  get_mapping_context: 'agent.context.read',
  git_branches: 'git.branches',
  git_commit: 'git.commit',
  git_diff: 'git.diff',
  git_file_versions: 'git.versions',
  git_log: 'git.log',
  git_show: 'git.show',
  git_status: 'git.status',
  list_files: 'documents.list',
  list_projects: 'projects.list',
  list_trash: 'trash.list',
  plan_query: 'agent.plan',
  read_file: 'files.read',
  restore_file: 'trash.restore',
  save_file: 'files.save',
  validate_text: 'files.validate',
};

/** A twin that records its calls and answers from a table. */
function fakeTwin(answers: Record<string, unknown>) {
  const calls: { operation: string; input: any }[] = [];
  const twin = async (operation: string, input: any) => {
    calls.push({ operation, input });
    const body = answers[operation];
    return { ok: true as const, answer: { status: 200, body, headers: new Headers() } };
  };
  return { twin, calls };
}

/** Each tool is the twin of the route the contract names, and writes pass exactly what they were given. */
export async function mcpToolsCase(target: string) {
  const tree = treeOf(target);
  const { TOOLS } = await import(join(tree, 'tool-registry.ts'));
  for (const tool of TOOLS) assert.equal(tool.operation, EXPECTED_OPERATIONS[tool.name], tool.name);
  const { createCursorCodec } = await import(join(tree, 'cursors.ts'));
  const { createReceiptStore } = await import(join(tree, 'receipts.ts'));
  const context = (twin: unknown) => ({
    twin,
    cursors: createCursorCodec(),
    receipts: createReceiptStore(join(mkdtempSync(join(tmpdir(), 'mutant-tools-')), 'r')),
    principalId: 'local',
    signal: new AbortController().signal,
  });
  const tool = (name: string) => TOOLS.find((candidate: { name: string }) => candidate.name === name);
  const version = 'a'.repeat(64);
  const saved = fakeTwin({ 'files.save': { path: 'a.yaml', hash: 'b'.repeat(64), findings: [], source: 'stored', demoted: [{}] } });
  const result = await tool('save_file').run({ project: 'p', path: 'a.yaml', baseVersion: version, source: 'x' }, context(saved.twin));
  assert.equal(saved.calls[0].input.body.baseHash, version, 'the base version reaches the save');
  assert.equal(result.data.stored.differs, true, 'a rewrite by a content guard is disclosed');
  assert.equal(result.data.stored.source, 'stored');
  const files = [{ path: 'a.yaml', version }];
  const commitTwin = fakeTwin({ 'git.status': { published: { state: 'in-sync', branch: 'main' } }, 'git.commit': { commit: 'c'.repeat(40) } });
  const commitArgs = { project: 'p', message: 'm', files, expectedBranch: 'work/local', expectedHead: 'd'.repeat(40), idempotencyKey: 'commit-key-00000001' };
  const committed = await tool('git_commit').run(commitArgs, context(commitTwin.twin));
  assert.equal(committed.ok, true);
  const sent = commitTwin.calls.find(call => call.operation === 'git.commit')!.input.body;
  assert.deepEqual(Object.keys(sent).sort(), ['expectedBranch', 'expectedHead', 'files', 'message'], 'no push and no extra keys');
  assert.deepEqual(sent.files, files);
  assert.equal(sent.expectedHead, 'd'.repeat(40));
  const alteredTwin = fakeTwin({ 'git.commit': { commit: 'c'.repeat(40), altered: ['a.yaml'] } });
  const altered = await tool('git_commit').run({ ...commitArgs, idempotencyKey: 'commit-key-00000002' }, context(alteredTwin.twin));
  assert.equal(altered.ok, true, 'a commit that was made is a success even when a hook altered a file');
  assert.deepEqual(altered.data.altered, ['a.yaml']);
  const { mapTwinFailure } = await import(join(tree, 'twin-dispatch.ts'));
  const hidden = mapTwinFailure('files.read', { status: 404, body: { error: 'Not found.' }, headers: new Headers() });
  const missing = mapTwinFailure('files.read', { status: 404, body: { error: 'File not found.' }, headers: new Headers() });
  assert.deepEqual(hidden, missing);
  assert.equal(hidden.error.code, 'not_found');
  assert.equal(mapTwinFailure('files.save', { status: 409, body: { error: 'precondition', changed: {} }, headers: new Headers() }).error.code, 'precondition_failed');
}

/** The serializer keeps the protocol fields of a record. */
export async function mcpAuditCase(target: string) {
  const folder = target.replace(/\/[^/]+$/, '');
  const { createAuditLog } = await import(join(folder, 'audit.ts'));
  const audit = createAuditLog({ dir: join(mkdtempSync(join(tmpdir(), 'mutant-audit-')), 'audit') });
  const stored = audit.append({
    requestId: 'r',
    origin: 'mcp',
    tool: 'files.read',
    connection: 'local',
    method: 'tools/call',
    clientLabel: 'label',
    result: 'conflict',
    principal: { id: 'local', kind: 'local' },
    action: 'read',
    resource: { type: 'workspace' },
    decision: 'allow',
    rules: [],
  });
  for (const field of ['method', 'clientLabel', 'result', 'tool', 'connection', 'origin']) assert.equal(Object.hasOwn(stored, field), true, `${field} is stored`);
}

/** The transport row leaves no record of its own and exists in local mode only. */
export async function mcpRowsCase(target: string) {
  const folder = target.replace(/\/[^/]+$/, '');
  const { routeFor } = await import(join(folder, 'route-actions.ts'));
  const local = routeFor('POST', '/api/mcp', 'local');
  assert.equal(local.row.unaudited, true);
  assert.equal(routeFor('POST', '/api/mcp', 'server'), null);
}
