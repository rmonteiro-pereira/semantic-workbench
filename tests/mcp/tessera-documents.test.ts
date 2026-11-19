// Tessera documents through the agent endpoint: the same findings as the browser's validator, byte-exact reads and patches, no note text in published answers, and no compiler among the tools.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import { TOOLS } from '../../src/server/mcp/tool-registry';
import { validateInput } from '../../src/shared/validation/input';
import { EXPECTED_FINDINGS } from '../helpers/tessera-refusals';
import { startLocalServer, type LocalServer } from './helpers/local-server';

const PROJECT = 'mapped-commerce';
const FIXTURES = 'tests/fixtures/tessera/documents/';
const NOTE_TEXT = 'SECRET-NOTE-FOR-AUTHORS-ONLY';
const fixture = (name: string) => readFileSync(FIXTURES + name, 'utf8');

let server: LocalServer;
let client: Awaited<ReturnType<LocalServer['connect']>>;
beforeAll(async () => {
  server = await startLocalServer({ examples: [PROJECT] });
  client = await server.connect();
}, 120_000);
afterAll(async () => {
  await server.close();
});

async function call(name: string, args: Record<string, unknown>): Promise<any> {
  return ((await client.callTool({ name, arguments: args })) as any).structuredContent;
}
const http = (path: string, init: RequestInit = {}) =>
  server.handler(new Request(server.url + path, { ...init, headers: { host: `127.0.0.1:${server.port}`, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' } }));

/** What the browser's validator says about a source, in the shape a tool reports. */
function browserFindings(source: string, filename: string) {
  return validateInput(source, filename)
    .issues.map(issue => ({ code: issue.code, pointer: issue.path, severity: issue.severity, message: issue.message }))
    .sort((left, right) => (left.pointer + left.code < right.pointer + right.code ? -1 : 1));
}

/** The findings of a tool answer, without positions, in the same order. */
function toolFindings(findings: { code?: string; pointer: string; severity: string; message: string }[]) {
  return findings
    .map(finding => ({ code: finding.code, pointer: finding.pointer, severity: finding.severity, message: finding.message }))
    .sort((left, right) => (left.pointer + left.code < right.pointer + right.code ? -1 : 1));
}

async function readWhole(path: string): Promise<{ text: string; version: string }> {
  const page = (await call('read_file', { project: PROJECT, path })).data;
  expect(page.nextOffset).toBeUndefined();
  return { text: page.text, version: page.version };
}

test('validate_text, get_findings and read_file give the browser validator findings for every Tessera fixture', async () => {
  for (const name of Object.keys(EXPECTED_FINDINGS)) {
    const source = fixture(name);
    const answer = await call('validate_text', { project: PROJECT, path: name, source });
    expect(answer.ok, name).toBe(true);
    expect(toolFindings(answer.data.findings), name).toEqual(browserFindings(source, name));
    expect(answer.data.valid, name).toBe(validateInput(source, name).valid && !browserFindings(source, name).some(finding => finding.severity === 'error'));
    const expectedCodes = EXPECTED_FINDINGS[name].map(pair => pair.split(' ')[0]).filter(code => code.startsWith('tessera'));
    const toolCodes = answer.data.findings.map((finding: { code: string }) => finding.code).filter((code: string) => code.startsWith('tessera'));
    expect(toolCodes.sort(), name).toEqual(expectedCodes.sort());
  }
  for (const name of ['notes-everywhere.yaml', 'valid.yaml']) {
    const created = await call('create_file', { project: PROJECT, path: name, source: fixture(name) });
    expect(created.ok, name).toBe(true);
    const findings = await call('get_findings', { project: PROJECT, path: name });
    expect(toolFindings(findings.data.items), name).toEqual(browserFindings(fixture(name), name));
    expect((await call('read_file', { project: PROJECT, path: name })).data.findingCount, name).toBe(browserFindings(fixture(name), name).length);
  }
});

test('a refused Tessera document is never saved and a marker is never added by creating a file', async () => {
  for (const name of ['notes-on-dataset.yaml', 'semantic-model-marked.yaml']) {
    const refused = await call('create_file', { project: PROJECT, path: `refused-${name}`, source: fixture(name) });
    expect(refused.ok, name).toBe(false);
  }
  const plain = 'version: 0.2.0.dev0\nname: Plain\nontology:\n  - concept: Order\n    type: EntityType\n';
  const created = await call('create_file', { project: PROJECT, path: 'plain.yaml', source: plain });
  expect(created.ok).toBe(true);
  expect((await readWhole('plain.yaml')).text).toBe(plain);
});

test('reading, patching and saving a Tessera document keep every untouched byte, marker and note', async () => {
  const original = fixture('notes-everywhere.yaml');
  const path = 'retail-notes.yaml';
  const created = await call('create_file', { project: PROJECT, path, source: original });
  expect(created.ok).toBe(true);
  const first = await readWhole(path);
  expect(first.text).toBe(original);
  const from = original.indexOf('A customer order.');
  const to = from + 'A customer order.'.length;
  const patched = await call('save_file', { project: PROJECT, path, baseVersion: first.version, patches: [{ from, to, insert: 'An order a customer placed.' }] });
  expect(patched.ok, JSON.stringify(patched)).toBe(true);
  const expected = original.slice(0, from) + 'An order a customer placed.' + original.slice(to);
  const second = await readWhole(path);
  expect(second.text).toBe(expected);
  expect(patched.data.stored.differs).toBe(false);
  const replaced = await call('save_file', { project: PROJECT, path, baseVersion: second.version, source: original });
  expect(replaced.ok).toBe(true);
  expect((await readWhole(path)).text).toBe(original);
});

/** The mapped ontology with a marker and a note on the root and on a concept. */
function withNotes(source: string): string {
  const document = parseDocument(source);
  document.set('tessera', 1);
  document.set('tessera_notes', `${NOTE_TEXT} root`);
  document.setIn(['ontology', 0, 'tessera_notes'], `${NOTE_TEXT} concept`);
  return document.toString({ lineWidth: 0 });
}

/** Publishes the project as it is committed now and reads every published-context tool. */
async function publishedAnswers() {
  const stage = await http(`/api/projects/${PROJECT}/git/stage`, { method: 'POST', body: JSON.stringify({ all: true }) });
  expect(stage.status).toBe(200);
  await http(`/api/projects/${PROJECT}/git/commit`, { method: 'POST', body: JSON.stringify({ message: 'Snapshot for the agent view' }) });
  const published = await http(`/api/projects/${PROJECT}/git/publish`, { method: 'POST', body: '{}' });
  expect(published.status).toBe(200);
  const catalog = await call('get_mapping_catalog', { project: PROJECT });
  const mappingId = catalog.data.items[0].id;
  const context = await call('get_mapping_context', { project: PROJECT, mappingId });
  const metric = context.data.context.metrics[0].id;
  const plan = await call('plan_query', { project: PROJECT, mappingId, metrics: [metric], dimensions: [] });
  const explanation = await call('explain_metric', { project: PROJECT, path: 'commerce.mapped-semantic.yaml', metric });
  // The snapshot id and the revision of a document follow the stored bytes, which differ by the notes.
  const withoutSnapshot = (answer: any) => JSON.parse(JSON.stringify({ ...answer.data, snapshot: undefined }, (key, value) => (key === 'revision' ? undefined : value)));
  return { catalog: withoutSnapshot(catalog), context: withoutSnapshot(context), plan: withoutSnapshot(plan), explanation: withoutSnapshot(explanation) };
}

test('the published context, plan and metric explanation of a Tessera ontology equal its unmarked twin and hold no note text', async () => {
  const path = 'commerce.mapped-ontology.yaml';
  const twin = await publishedAnswers();
  const { text, version } = await readWhole(path);
  const saved = await call('save_file', { project: PROJECT, path, baseVersion: version, source: withNotes(text) });
  expect(saved.ok, JSON.stringify(saved)).toBe(true);
  expect((await readWhole(path)).text).toContain(NOTE_TEXT);
  const marked = await publishedAnswers();
  expect(marked).toEqual(twin);
  expect(JSON.stringify(marked)).not.toContain(NOTE_TEXT);
  expect(JSON.stringify(marked)).not.toContain('tessera');
});

test('no tool is a compiler and the validation and read tools say Tessera ontologies are accepted', () => {
  for (const tool of TOOLS) {
    expect(tool.name, tool.name).not.toMatch(/compile|loss/i);
    expect(tool.description, tool.name).not.toMatch(/compil|loss report/i);
  }
  for (const name of ['validate_text', 'get_findings']) {
    const description = TOOLS.find(tool => tool.name === name)!.description;
    expect(description, name).toContain('Tessera ontologies are accepted');
    expect(description, name).toContain('Tessera codes');
  }
  expect(TOOLS.find(tool => tool.name === 'read_file')!.description).toContain('Tessera ontology is returned byte for byte');
});
