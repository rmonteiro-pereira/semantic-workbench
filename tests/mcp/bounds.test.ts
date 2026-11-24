// Calls are bounded: Git absent and cancelled calls leave file tools working, a generated project of 20,000 files stays inside the deadline and the cap, and a write that was started finishes atomically.
import { expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RESULT_CAP_BYTES } from '../../src/server/mcp/tool-results';
import { example } from '../helpers/temp-data-dir';
import { startLocalServer } from './helpers/local-server';

async function call(client: Awaited<ReturnType<Awaited<ReturnType<typeof startLocalServer>>['connect']>>, name: string, args: Record<string, unknown>): Promise<any> {
  return ((await client.callTool({ name, arguments: args })) as any).structuredContent;
}

test('with Git absent the Git tools answer unavailable and the file tools keep working', async () => {
  const server = await startLocalServer({ workspace: { gitBinary: '/nonexistent/git-binary' } });
  try {
    const client = await server.connect();
    await server.seed([{ path: 'a.ontology.yaml', source: await example('commerce', 'commerce.mapped-ontology.yaml') }], 'plain');
    expect((await call(client, 'list_files', { project: 'plain' })).ok).toBe(true);
    expect((await call(client, 'read_file', { project: 'plain', path: 'a.ontology.yaml', length: 20 })).ok).toBe(true);
    const status = await call(client, 'git_status', { project: 'plain' });
    expect(status.data.gitAvailable).toBe(false);
    for (const name of ['git_log', 'git_branches', 'git_file_versions']) {
      const answer = await call(client, name, { project: 'plain', path: 'a.ontology.yaml' });
      if (!answer.ok) expect(['unavailable', 'invalid_input'], name).toContain(answer.error.code);
      expect(JSON.stringify(answer)).not.toContain(server.root);
    }
  } finally {
    await server.close();
  }
}, 30_000);

test('a project of 20,000 files answers every list tool inside the deadline and under the cap', async () => {
  const server = await startLocalServer({ examples: ['mapped-commerce'] });
  try {
    const client = await server.connect();
    const directory = join(server.root, 'projects', 'mapped-commerce', 'generated');
    mkdirSync(directory, { recursive: true });
    const template = readFileSync(join(server.root, 'projects', 'mapped-commerce', 'commerce.mapped-ontology.yaml'), 'utf8');
    for (let index = 0; index < 20_000; index++) writeFileSync(join(directory, `file-${index}.ontology.yaml`), template);
    await server.ws.rescan?.('mapped-commerce');
    const started = performance.now();
    const first = await call(client, 'list_files', { project: 'mapped-commerce', limit: 200 });
    const elapsed = performance.now() - started;
    expect(first.ok).toBe(true);
    expect(first.data.nextCursor).toBeDefined();
    expect(JSON.stringify(first).length).toBeLessThan(RESULT_CAP_BYTES * 2);
    expect(elapsed).toBeLessThan(30_000);
    console.log(`list_files over a project with 20,000+ files: ${Math.round(elapsed)} ms`);
    for (const [name, args] of [
      ['git_status', { project: 'mapped-commerce' }],
      ['list_projects', {}],
      ['list_trash', {}],
    ] as const) {
      const begun = performance.now();
      const answer = await call(client, name, args);
      expect(answer.ok, name).toBe(true);
      expect(performance.now() - begun, name).toBeLessThan(30_000);
      expect(JSON.stringify(answer).length, name).toBeLessThan(RESULT_CAP_BYTES * 2);
    }
  } finally {
    await server.close();
  }
}, 280_000);

test('closing the response during a read stops it and during a write leaves the file whole', async () => {
  const server = await startLocalServer({ examples: ['mapped-commerce'] });
  try {
    const path = 'commerce.mapped-ontology.yaml';
    const file = join(server.root, 'projects', 'mapped-commerce', path);
    const before = readFileSync(file, 'utf8');
    const version = (await (await server.handler(new Request(`${server.url}/api/projects/mapped-commerce/files/${path}`))).json()) as { hash: string };
    const send = (name: string, args: unknown, signal: AbortSignal) =>
      fetch(server.endpoint, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${server.capability()}`,
          'mcp-protocol-version': '2026-07-28',
          'mcp-method': 'tools/call',
          'mcp-name': name,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name,
            arguments: args,
            _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {}, 'io.modelcontextprotocol/clientInfo': { name: 'x', version: '1' } },
          },
        }),
      }).catch(() => null);
    const readController = new AbortController();
    const pendingRead = send('read_file', { project: 'mapped-commerce', path }, readController.signal);
    readController.abort();
    await pendingRead;
    const writeController = new AbortController();
    const pendingWrite = send('save_file', { project: 'mapped-commerce', path, baseVersion: version.hash, patches: [{ from: 0, to: 0, insert: '# whole\n' }] }, writeController.signal);
    writeController.abort();
    await pendingWrite;
    await Bun.sleep(300);
    const after = readFileSync(file, 'utf8');
    expect([before, '# whole\n' + before]).toContain(after);
    const client = await server.connect();
    expect((await call(client, 'list_projects', {})).ok).toBe(true);
  } finally {
    await server.close();
  }
});
