// Tests file imports, byte-preserving saves, drafts and project creation through the API.
import { test, expect } from 'bun:test';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from '../src/server/projects/atomic';
import { applyPatches } from '../src/server/projects/workspace';
import { testWorkspace, example } from './helpers/temp-data-dir';
import { LOCAL_READER } from '../src/server/projects/reader';
const api = (workspace: { handler: (request: Request) => Promise<Response> }, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  workspace.handler(
    new Request('http://127.0.0.1:4310' + path, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
const ontology = '# keep\r\nversion: 0.2.0.dev0\r\nname: Shop\r\nontology:\r\n  - concept: Customer\r\n    type: EntityType\r\n';
async function project() {
  const workspace = await testWorkspace();
  const response = await api(workspace, 'POST', '/api/import', {
    files: [
      { path: 'shop.yaml', source: ontology },
      { path: 'dir/ref.ttl', source: '@prefix ex: <https://e/> .\nex:a ex:b ex:c .\n' },
    ],
  });
  expect(response.status).toBe(200);
  return { t: workspace, created: await response.json() };
}
test('import creates one project per batch, named after its ontology, with one commit', async () => {
  const { t: workspace, created } = await project();
  try {
    expect(created.slug).toBe('shop');
    expect(created.name).toBe('Shop');
    expect(created.written).toEqual([
      { path: 'shop.yaml', hash: sha256(ontology) },
      { path: 'dir/ref.ttl', hash: sha256('@prefix ex: <https://e/> .\nex:a ex:b ex:c .\n') },
    ]);
    const projects = await (await api(workspace, 'GET', '/api/projects')).json();
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      slug: 'shop',
      name: 'Shop',
      origin: 'import',
      branch: 'main',
      changes: 0,
    });
    expect(projects[0].files.map((f: any) => [f.path, f.docType, f.valid, f.gitState])).toEqual([
      ['dir/ref.ttl', 'RDF', true, 'clean'],
      ['shop.yaml', 'Ossie ontology', true, 'clean'],
    ]);
    expect(readFileSync(join(workspace.root, 'projects/shop/shop.yaml'), 'utf8')).toBe(ontology);
    expect((await workspace.ws.git.run(join(workspace.root, 'projects/shop'), ['log', '--format=%s'])).stdout.trim()).toBe('Import 2 files');
    const second = await (
      await api(workspace, 'POST', '/api/import', {
        files: [{ path: 'other.yaml', source: ontology }],
      })
    ).json();
    expect([second.slug, second.name]).toEqual(['shop-2', 'Shop (2)']);
    const invalid = await api(workspace, 'POST', '/api/import', {
      files: [
        { path: 'ok.yaml', source: ontology },
        { path: 'bad.yaml', source: 'version: 0.2.0.dev0\nontology: []' },
      ],
    });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).issues[0].message).toContain('bad.yaml');
    for (const files of [[{ path: '../x.yaml', source: ontology }], [{ path: '.git/config', source: ontology }], [{ path: 'a.csv', source: 'a,b' }], []])
      expect((await api(workspace, 'POST', '/api/import', { files })).status).toBe(400);
    expect(await (await api(workspace, 'GET', '/api/projects')).json()).toHaveLength(2);
  } finally {
    workspace.dispose();
  }
});
test('GET returns the exact bytes, hash and findings', async () => {
  const { t: workspace } = await project();
  try {
    const file = await (await api(workspace, 'GET', '/api/projects/shop/files/shop.yaml')).json();
    expect(file).toMatchObject({
      path: 'shop.yaml',
      source: ontology,
      hash: sha256(ontology),
      docType: 'Ossie ontology',
    });
    expect((await api(workspace, 'GET', '/api/projects/shop/files/dir%2Fref.ttl')).status).toBe(200);
    expect((await api(workspace, 'GET', '/api/projects/shop/files/dir/ref.ttl')).status).toBe(200);
    expect((await api(workspace, 'GET', '/api/projects/shop/files/missing.yaml')).status).toBe(404);
    expect((await api(workspace, 'GET', '/api/projects/nope/files/shop.yaml')).status).toBe(404);
    for (const bad of ['%2E%2E%2Fescape.yaml', '..%2F..%2Fstate%2Fprojects.json', '.git%2Fconfig', '%2Fetc%2Fpasswd'])
      expect((await api(workspace, 'GET', '/api/projects/shop/files/' + bad)).status).toBeGreaterThanOrEqual(400);
  } finally {
    workspace.dispose();
  }
});
test('PUT with a stale baseHash returns 409 with the current file and writes nothing', async () => {
  const { t: workspace } = await project();
  try {
    const path = join(workspace.root, 'projects/shop/shop.yaml');
    const ok = await api(workspace, 'PUT', '/api/projects/shop/files/shop.yaml', {
      baseHash: sha256(ontology),
      source: ontology.replace('Shop', 'Store'),
    });
    expect(ok.status).toBe(200);
    const saved = await ok.json();
    expect(saved.hash).toBe(sha256(readFileSync(path)));
    const stale = await api(workspace, 'PUT', '/api/projects/shop/files/shop.yaml', {
      baseHash: sha256(ontology),
      source: ontology.replace('Shop', 'Other'),
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({
      error: 'stale',
      currentHash: saved.hash,
      currentSource: ontology.replace('Shop', 'Store'),
    });
    expect(readFileSync(path, 'utf8')).toBe(ontology.replace('Shop', 'Store'));
    writeFileSync(path, 'name: External\nontology: [{concept: X}]\n');
    const external = await api(workspace, 'PUT', '/api/projects/shop/files/shop.yaml', {
      baseHash: saved.hash,
      source: ontology,
    });
    expect(external.status).toBe(409);
    expect((await external.json()).currentSource).toBe('name: External\nontology: [{concept: X}]\n');
    expect(
      (
        await api(workspace, 'PUT', '/api/projects/shop/files/new.yaml', {
          baseHash: sha256('x'),
          source: ontology,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await api(workspace, 'PUT', '/api/projects/shop/files/new.yaml', {
          baseHash: null,
          source: ontology,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await api(workspace, 'PUT', '/api/projects/shop/files/new.yaml', {
          baseHash: null,
          source: ontology,
        })
      ).status,
    ).toBe(409);
  } finally {
    workspace.dispose();
  }
});
test('patches apply to the base bytes and leave every other byte (CRLF included) unchanged', async () => {
  const { t: workspace } = await project();
  try {
    const from = ontology.indexOf('Customer');
    const response = await api(workspace, 'PUT', '/api/projects/shop/files/shop.yaml', {
      baseHash: sha256(ontology),
      patches: [{ from, to: from + 8, insert: 'Buyer' }],
    });
    expect(response.status).toBe(200);
    expect(readFileSync(join(workspace.root, 'projects/shop/shop.yaml'), 'utf8')).toBe(ontology.replace('Customer', 'Buyer'));
    expect(
      applyPatches('a\r\nb\nc\r\n', [
        { from: 0, to: 1, insert: 'x' },
        { from: 5, to: 6, insert: 'z' },
      ]),
    ).toBe('x\r\nb\nz\r\n');
    for (const patches of [
      [{ from: 5, to: 2, insert: '' }],
      [
        { from: 0, to: 3, insert: '' },
        { from: 2, to: 4, insert: '' },
      ],
      [{ from: 0, to: 999, insert: '' }],
      [{ from: 0.5, to: 1, insert: '' }],
      'x',
    ])
      expect(() => applyPatches('abcdef', patches as any)).toThrow();
    const current = sha256(readFileSync(join(workspace.root, 'projects/shop/shop.yaml')));
    expect(
      (
        await api(workspace, 'PUT', '/api/projects/shop/files/shop.yaml', {
          baseHash: current,
          patches: [{ from: 0, to: 999999, insert: '' }],
        })
      ).status,
    ).toBe(400);
  } finally {
    workspace.dispose();
  }
});
test('an invalid source is rejected with issues and no write', async () => {
  const { t: workspace } = await project();
  try {
    const before = readdirSync(join(workspace.root, 'projects/shop'));
    const response = await api(workspace, 'PUT', '/api/projects/shop/files/shop.yaml', {
      baseHash: sha256(ontology),
      source: 'version: 0.2.0.dev0\nontology: [ ]',
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.issues[0].path).toBe('/ontology');
    expect(readFileSync(join(workspace.root, 'projects/shop/shop.yaml'), 'utf8')).toBe(ontology);
    expect(readdirSync(join(workspace.root, 'projects/shop'))).toEqual(before);
    for (const body of [
      { source: 'x' },
      { baseHash: 'abc', source: ontology },
      { baseHash: sha256(ontology) },
      { baseHash: sha256(ontology), source: ontology, patches: [] },
      { baseHash: sha256(ontology), source: ontology, extra: 1 },
    ])
      expect((await api(workspace, 'PUT', '/api/projects/shop/files/shop.yaml', body)).status).toBe(400);
    expect(
      (
        await api(workspace, 'PUT', '/api/projects/shop/files/notes.csv', {
          baseHash: null,
          source: 'a,b',
        })
      ).status,
    ).toBe(400);
    expect((await api(workspace, 'PUT', '/api/projects/shop/files/shop.yaml', { baseHash: sha256(ontology), source: ontology }, { origin: 'https://evil.example' })).status).toBe(403);
  } finally {
    workspace.dispose();
  }
});
test('.gitignore is plain text: saved without model validation, and rescans apply it', async () => {
  const { t: workspace } = await project();
  try {
    writeFileSync(join(workspace.root, 'projects/shop/scratch.yaml'), ontology);
    await workspace.ws.rescan('shop');
    const paths = async () => (await (await api(workspace, 'GET', '/api/projects')).json())[0].files.map((f: any) => f.path);
    expect(await paths()).toEqual(['dir/ref.ttl', 'scratch.yaml', 'shop.yaml']);
    expect(
      (
        await api(workspace, 'PUT', '/api/projects/shop/files/.gitignore', {
          baseHash: null,
          source: 'scratch.yaml\ndir/\n',
        })
      ).status,
    ).toBe(200);
    // As in Git, ignore rules hide untracked files; a committed file stays listed.
    expect(await paths()).toEqual(['.gitignore', 'dir/ref.ttl', 'shop.yaml']);
  } finally {
    workspace.dispose();
  }
});
test('drafts persist with their base hash', async () => {
  const { t: workspace } = await project();
  try {
    expect(
      (
        await api(workspace, 'PUT', '/api/drafts/shop/shop.yaml', {
          baseHash: sha256(ontology),
          text: 'draft text',
          patches: [],
        })
      ).status,
    ).toBe(200);
    expect(await (await api(workspace, 'GET', '/api/drafts')).json()).toMatchObject([{ project: 'shop', path: 'shop.yaml', baseHash: sha256(ontology) }]);
    expect((await (await api(workspace, 'GET', '/api/drafts/shop/shop.yaml')).json()).text).toBe('draft text');
    expect(
      (
        await api(workspace, 'PUT', '/api/drafts/nope/shop.yaml', {
          baseHash: null,
          text: '',
          patches: [],
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api(workspace, 'PUT', '/api/drafts/shop/..%2Fx', {
          baseHash: null,
          text: '',
          patches: [],
        })
      ).status,
    ).toBe(400);
    await api(workspace, 'PUT', '/api/projects/shop/files/shop.yaml', {
      baseHash: sha256(ontology),
      source: ontology.replace('Shop', 'Saved'),
    });
    expect(await (await api(workspace, 'GET', '/api/drafts')).json()).toEqual([]);
    await api(workspace, 'PUT', '/api/drafts/shop/shop.yaml', {
      baseHash: null,
      text: 'again',
      patches: [],
    });
    expect((await api(workspace, 'DELETE', '/api/drafts/shop/shop.yaml')).status).toBe(204);
    expect(await (await api(workspace, 'GET', '/api/drafts')).json()).toEqual([]);
  } finally {
    workspace.dispose();
  }
});
test('projects can be created empty and renamed; names stay unique', async () => {
  const workspace = await testWorkspace();
  try {
    const created = await (await api(workspace, 'POST', '/api/projects', { name: 'Sales models' })).json();
    expect(created).toEqual({ slug: 'sales-models', name: 'Sales models' });
    expect((await workspace.ws.git.run(join(workspace.root, 'projects/sales-models'), ['log', '--format=%s'])).stdout.trim()).toBe('Create project');
    expect((await api(workspace, 'POST', '/api/projects', { name: 'sales MODELS' })).status).toBe(400);
    expect(await (await api(workspace, 'PATCH', '/api/projects/sales-models', { name: 'Revenue' })).json()).toEqual({ slug: 'sales-models', name: 'Revenue' });
    expect((await api(workspace, 'PATCH', '/api/projects/missing', { name: 'X' })).status).toBe(404);
    expect((await api(workspace, 'PATCH', '/api/projects/sales-models', { name: '' })).status).toBe(400);
    expect(workspace.ws.state.registry().projects.map(p => p.name)).toEqual(['Revenue']);
  } finally {
    workspace.dispose();
  }
});
test('example loaders create the example project once and reopen it afterwards', async () => {
  const workspace = await testWorkspace();
  try {
    expect(await (await api(workspace, 'POST', '/api/examples/flights')).json()).toMatchObject({
      slug: 'flights',
      name: 'Ossie Flights',
      created: true,
      commit: { committed: true, message: 'Import 7 files' },
    });
    expect(await (await api(workspace, 'POST', '/api/examples/flights')).json()).toEqual({
      slug: 'flights',
      name: 'Ossie Flights',
      created: false,
    });
    expect(readFileSync(join(workspace.root, 'projects/flights/flights.yaml'), 'utf8')).toBe(await example('ossie', 'flights.yaml'));
    expect((await api(workspace, 'POST', '/api/examples/unknown')).status).toBe(404);
    const status = await (await api(workspace, 'GET', '/api/status')).json();
    expect(status).toMatchObject({
      gitAvailable: true,
      identityConfigured: true,
      migration: null,
      recovery: [],
    });
  } finally {
    workspace.dispose();
  }
});
test('the legacy /api/documents facade keeps its shapes over the folder store', async () => {
  const { t: workspace } = await project();
  try {
    const docs = await (await api(workspace, 'GET', '/api/documents')).json();
    expect(docs.map((d: any) => d.id)).toEqual(['shop/dir/ref.ttl', 'shop/shop.yaml']);
    const doc = docs[1];
    expect(Object.keys(doc).sort()).toEqual(['filename', 'hash', 'id', 'path', 'project', 'revision', 'source', 'updated']);
    expect(doc).toMatchObject({ filename: 'shop.yaml', source: ontology, hash: sha256(ontology) });
    expect(Number.isSafeInteger(doc.revision)).toBe(true);
    const saved = await (
      await api(workspace, 'POST', '/api/documents', {
        id: doc.id,
        filename: 'shop.yaml',
        source: ontology.replace('Shop', 'Facade'),
        revision: doc.revision,
      })
    ).json();
    expect(saved.id).toBe(doc.id);
    expect(saved.revision).not.toBe(doc.revision);
    expect(
      (
        await api(workspace, 'POST', '/api/documents', {
          id: doc.id,
          filename: 'shop.yaml',
          source: ontology,
          baseHash: doc.hash,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api(workspace, 'POST', '/api/documents', {
          id: doc.id,
          filename: 'shop.yaml',
          source: ontology,
          baseHash: saved.hash,
        })
      ).status,
    ).toBe(200);
  } finally {
    workspace.dispose();
  }
});
test('an example loader opens a project that already holds the identical example files', async () => {
  const workspace = await testWorkspace();
  try {
    const files = await Promise.all(
      ['commerce.mapping.yaml', 'commerce.mapped-ontology.yaml', 'commerce.mapped-semantic.yaml', 'commerce.odcs.yaml'].map(async path => ({ path, source: await example('commerce', path) })),
    );
    const imported = await workspace.ws.importBatch({ files }, LOCAL_READER);
    expect(await workspace.ws.loadExample('mapped-commerce')).toEqual({
      slug: imported.slug,
      name: imported.name,
      created: false,
    });
    await workspace.ws.saveFile(
      imported.slug,
      'commerce.mapping.yaml',
      {
        baseHash: sha256(files[0].source),
        source: files[0].source + '# changed\n',
      },
      LOCAL_READER,
    );
    expect((await workspace.ws.loadExample('mapped-commerce')).created).toBe(true);
  } finally {
    workspace.dispose();
  }
});
