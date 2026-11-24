// Validation writes nothing, saving keeps the browser's guarantees, and the person's draft survives an agent save.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readFileSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { startLocalServer, type LocalServer } from './helpers/local-server';

const PROJECT = 'mapped-commerce';
const FILE = 'commerce.mapped-ontology.yaml';
let server: LocalServer;
let client: Awaited<ReturnType<LocalServer['connect']>>;
beforeAll(async () => {
  server = await startLocalServer({ examples: ['mapped-commerce'] });
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
const diskFile = (path: string) => join(server.root, 'projects', PROJECT, path);
const current = async (path = FILE) => (await (await http(`/api/projects/${PROJECT}/files/${path}`)).json()) as { source: string; hash: string };

test('validate_text reports what a save would and writes nothing', async () => {
  const before = readFileSync(diskFile(FILE), 'utf8');
  const { hash } = await current();
  const broken = await call('validate_text', { project: PROJECT, path: FILE, source: 'ontology: [' });
  expect(broken.data.valid).toBe(false);
  expect(broken.data.findings[0].line).toBeDefined();
  const save = await http(`/api/projects/${PROJECT}/files/${FILE}`, { method: 'PUT', body: JSON.stringify({ baseHash: hash, source: 'ontology: [' }) });
  expect(save.status).toBe(400);
  const issues = ((await save.json()) as { issues: { message: string }[] }).issues;
  expect(issues.map(issue => issue.message)).toEqual(broken.data.findings.map((finding: { message: string }) => finding.message));
  const patch = await call('validate_text', { project: PROJECT, path: FILE, baseVersion: hash, patches: [{ from: 0, to: 0, insert: '# note\n' }] });
  expect(patch.data.valid).toBe(true);
  expect(readFileSync(diskFile(FILE), 'utf8')).toBe(before);
  expect((await call('validate_text', { project: PROJECT, path: FILE, baseVersion: 'a'.repeat(64), patches: [] })).error.code).toBe('conflict');
  expect((await call('validate_text', { project: PROJECT, path: FILE, source: 'a'.repeat(2_000_001) })).error.code).toBe('invalid_input');
});

test('patches change only the patched ranges and keep line endings; full text is stored as sent', async () => {
  const crlf = (await current()).source.replace('Mapped commerce ontology', 'Notes').replaceAll('\n', '\r\n');
  const created = await call('create_file', { project: PROJECT, path: 'notes.ontology.yaml', source: crlf });
  expect(created.ok).toBe(true);
  const text = readFileSync(diskFile('notes.ontology.yaml'), 'utf8');
  const index = text.indexOf('Notes');
  const patched = await call('save_file', { project: PROJECT, path: 'notes.ontology.yaml', baseVersion: created.data.version, patches: [{ from: index, to: index + 5, insert: 'Memos' }] });
  expect(patched.ok).toBe(true);
  expect(readFileSync(diskFile('notes.ontology.yaml'), 'utf8')).toBe(text.replace('Notes', 'Memos'));
  const replaced = await call('save_file', { project: PROJECT, path: 'notes.ontology.yaml', baseVersion: patched.data.version, source: text });
  expect(replaced.data.stored.differs).toBe(false);
  expect(readFileSync(diskFile('notes.ontology.yaml'), 'utf8')).toBe(text);
});

test('a stale version, invalid text, an existing path and unsafe paths never change a definition', async () => {
  const { hash, source } = await current();
  const stale = await call('save_file', { project: PROJECT, path: FILE, baseVersion: 'b'.repeat(64), source: source + '# other\n' });
  expect(stale.error).toMatchObject({ code: 'conflict', details: { currentVersion: hash, unchanged: false } });
  const same = await call('save_file', { project: PROJECT, path: FILE, baseVersion: 'b'.repeat(64), source });
  expect(same.error.details.unchanged).toBe(true);
  const invalid = await call('save_file', { project: PROJECT, path: FILE, baseVersion: hash, source: 'ontology: [' });
  expect(invalid.error.code).toBe('invalid_input');
  expect((await current()).hash).toBe(hash);
  const exists = await call('create_file', { project: PROJECT, path: FILE, source });
  expect(exists.error).toMatchObject({ code: 'conflict', details: { unchanged: true } });
  expect((await call('create_file', { project: PROJECT, path: FILE, source: 'x: 1\n' })).error.details.unchanged).toBe(false);
  for (const path of ['../escape.ontology.yaml', 'a/../../b.ontology.yaml', '/abs.ontology.yaml', FILE.toUpperCase()]) {
    const refused = await call('create_file', { project: PROJECT, path, source: 'x: 1\n' });
    expect(refused.ok, path).toBe(false);
    expect(existsSync(join(server.root, 'projects', 'escape.ontology.yaml'))).toBe(false);
  }
  symlinkSync(diskFile(FILE), diskFile('link.ontology.yaml'));
  expect((await call('save_file', { project: PROJECT, path: 'link.ontology.yaml', baseVersion: hash, source })).ok).toBe(false);
});

test("an agent's save keeps the person's unsaved draft of the same file", async () => {
  const { hash, source } = await current();
  const draft = await http(`/api/drafts/${PROJECT}/${FILE}`, { method: 'PUT', body: JSON.stringify({ baseHash: hash, text: source + '# unsaved\n' }) });
  expect(draft.status).toBe(200);
  const saved = await call('save_file', { project: PROJECT, path: FILE, baseVersion: hash, patches: [{ from: 0, to: 0, insert: '# agent\n' }] });
  expect(saved.ok).toBe(true);
  const kept = await http(`/api/drafts/${PROJECT}/${FILE}`);
  expect(kept.status).toBe(200);
  expect(((await kept.json()) as { text: string }).text).toContain('# unsaved');
  expect((await current()).hash).toBe(saved.data.version);
  writeFileSync(join(server.root, 'touch'), '');
});

test('a saved change reaches browsers through the existing live events', async () => {
  const stream = await fetch(`${server.url}/api/events`, { headers: { host: `127.0.0.1:${server.port}` } });
  const reader = stream.body!.getReader();
  const { hash } = await current();
  await call('save_file', { project: PROJECT, path: FILE, baseVersion: hash, patches: [{ from: 0, to: 0, insert: '# event\n' }] });
  let seen = '';
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && !seen.includes(PROJECT)) {
    const part = await Promise.race([reader.read(), Bun.sleep(1000).then(() => ({ done: true, value: undefined }))]);
    if (part.value) seen += new TextDecoder().decode(part.value);
    if (part.done) break;
  }
  await reader.cancel();
  expect(seen).toContain(PROJECT);
});
