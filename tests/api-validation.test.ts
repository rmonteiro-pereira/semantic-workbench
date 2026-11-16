// Tests validation failures through the HTTP API.
import { test, expect } from 'bun:test';
import { SnapshotUnavailableError, SnapshotUnreadableError } from '../src/server/projects/errors';
import { testWorkspace } from './helpers/temp-data-dir';
const source = 'name: Test\nontology: [{concept: A}]';
const request = (body: any) =>
  new Request('http://127.0.0.1:4310/api/documents', {
    method: 'POST',
    body: JSON.stringify(body),
  });
for (const [name, body] of [
  ['null', null],
  ['array', []],
  ['missing source', { filename: 'x.yaml' }],
  ['wrong filename type', { filename: 42, source }],
  ['wrong source type', { filename: 'x.yaml', source: {} }],
  ['invalid id', { filename: 'x.yaml', source, id: {} }],
  ['bad revision', { filename: 'x.yaml', source, revision: -1 }],
  ['fraction revision', { filename: 'x.yaml', source, revision: 1.5 }],
  ['invalid filename', { filename: '../x.yaml', source }],
  ['invalid model', { filename: 'x.yaml', source: 'ontology: []' }],
])
  test(`API rejects ${name} without writes`, async () => {
    const workspace = await testWorkspace();
    try {
      const response = await workspace.handler(request(body));
      expect(response.status).toBe(400);
      expect(workspace.ws.documents()).toHaveLength(0);
      expect(workspace.ws.cache.files()).toHaveLength(0);
    } finally {
      workspace.dispose();
    }
  });
test('API sends structured errors and valid save/read round-trip preserves bytes', async () => {
  const workspace = await testWorkspace();
  try {
    const handler = workspace.handler;
    const bad = await handler(request({ filename: 'x.yaml', source: 'ontology: [ ]' }));
    expect((await bad.json()).issues[0].path).toBe('/ontology');
    const response = await handler(request({ filename: 'x.yaml', source }));
    expect(response.status).toBe(200);
    const savedDocument = await response.json();
    expect(savedDocument.source).toBe(source);
    const failed = await handler(
      request({
        filename: 'x.yaml',
        source: 'ontology: []',
        id: savedDocument.id,
        revision: savedDocument.revision,
      }),
    );
    expect(failed.status).toBe(400);
    expect(workspace.ws.documents()[0]).toEqual(savedDocument);
    expect(workspace.ws.cache.entities('ungrouped', 'x.yaml')).toHaveLength(1);
    const list = await handler(new Request('http://localhost/api/documents'));
    expect(await list.json()).toEqual([savedDocument]);
    const stale = await handler(request({ ...savedDocument, revision: 2 }));
    expect(stale.status).toBe(400);
  } finally {
    workspace.dispose();
  }
});
test('API rejects malformed JSON, oversized requests, and untrusted origins', async () => {
  const workspace = await testWorkspace();
  try {
    const handler = workspace.handler;
    expect((await handler(new Request('http://localhost/api/documents', { method: 'POST', body: '{' }))).status).toBe(400);
    expect(
      (
        await handler(
          new Request('http://localhost/api/documents', {
            method: 'POST',
            body: 'x'.repeat(12_004_097),
          }),
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await handler(
          new Request('http://localhost/api/documents', {
            headers: { origin: 'https://other.example' },
          }),
        )
      ).status,
    ).toBe(403);
    expect((await handler(new Request('http://localhost/nope'))).status).toBe(404);
    expect(workspace.ws.documents()).toHaveLength(0);
  } finally {
    workspace.dispose();
  }
});

for (const reason of ['no-git', 'no-commit', 'unavailable'] as const) {
  test(`API reports snapshot absence as ${reason}`, async () => {
    const workspace = await testWorkspace();
    try {
      workspace.ws.documentsFor = () => {
        throw new SnapshotUnavailableError(reason);
      };
      const response = await workspace.handler(new Request('http://localhost/api/documents'));
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'no published snapshot', code: 'no-published-snapshot', reason });
    } finally {
      workspace.dispose();
    }
  });
}
test('API reports an unreadable publication candidate with its actionable refusal', async () => {
  const workspace = await testWorkspace();
  try {
    workspace.ws.documentsFor = () => {
      throw new SnapshotUnreadableError();
    };
    const response = await workspace.handler(new Request('http://localhost/api/documents'));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'The candidate snapshot is unreadable or exceeds its limits.' });
  } finally {
    workspace.dispose();
  }
});
