// Tests project management through the API.
import { test, expect } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { testWorkspace } from './helpers/temp-data-dir';
const ont = (name: string) => `name: ${name}\nontology: [{concept: ${name}}]\n`;
const api = (
  t: { handler: (r: Request) => Promise<Response> },
  method: string,
  path: string,
  body?: unknown,
) =>
  t.handler(
    new Request('http://127.0.0.1:4310' + path, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
async function setup() {
  const t = await testWorkspace();
  await t.ws.importBatch({ name: 'Alpha', files: [{ path: 'a.yaml', source: ont('A') }] });
  await t.ws.importBatch({
    name: 'Beta',
    files: [
      { path: 'a.yaml', source: ont('B') },
      { path: 'b.yaml', source: ont('B2') },
    ],
  });
  return t;
}
test('a file moves between projects with its view settings; an occupied target is a 409', async () => {
  const t = await setup();
  try {
    t.ws.state.writeView('beta', { 'b.yaml': { mode: 'types' } });
    expect(
      await (
        await api(t, 'POST', '/api/projects/beta/move', { path: 'b.yaml', toProject: 'alpha' })
      ).json(),
    ).toEqual({ project: 'alpha', path: 'b.yaml' });
    expect(readFileSync(join(t.root, 'projects/alpha/b.yaml'), 'utf8')).toBe(ont('B2'));
    expect(existsSync(join(t.root, 'projects/beta/b.yaml'))).toBe(false);
    expect(t.ws.grouping('alpha/b.yaml')).toEqual({ mode: 'types' });
    expect(t.ws.grouping('beta/b.yaml')).toEqual({});
    const clash = await api(t, 'POST', '/api/projects/beta/move', {
      path: 'a.yaml',
      toProject: 'alpha',
    });
    expect(clash.status).toBe(409);
    expect(await clash.json()).toMatchObject({
      error: 'occupied',
      suggestion: { toProject: 'alpha', toPath: 'a (2).yaml' },
    });
    expect(readFileSync(join(t.root, 'projects/alpha/a.yaml'), 'utf8')).toBe(ont('A'));
    expect(
      await (
        await api(t, 'POST', '/api/projects/beta/move', {
          path: 'a.yaml',
          toProject: 'alpha',
          toPath: 'nested/a.yaml',
        })
      ).json(),
    ).toEqual({ project: 'alpha', path: 'nested/a.yaml' });
    for (const body of [
      { path: '../x', toProject: 'alpha' },
      { path: 'a.yaml', toProject: '../x' },
      { path: 'missing.yaml', toProject: 'alpha' },
      { path: 'a.yaml' },
    ])
      expect((await api(t, 'POST', '/api/projects/beta/move', body)).status).toBeGreaterThanOrEqual(
        400,
      );
  } finally {
    t.dispose();
  }
});
test('re-import into a project asks about existing names: 409 conflicts, then replace or keep both', async () => {
  const t = await setup();
  try {
    const files = [
      { path: 'a.yaml', source: ont('Replaced') },
      { path: 'new.yaml', source: ont('New') },
    ];
    const conflict = await api(t, 'POST', '/api/projects/alpha/import', { files });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: 'conflict', conflicts: ['a.yaml'] });
    expect(existsSync(join(t.root, 'projects/alpha/new.yaml'))).toBe(false);
    const both = await (
      await api(t, 'POST', '/api/projects/alpha/import', { files, onConflict: 'keep-both' })
    ).json();
    expect(both.written.map((w: any) => w.path)).toEqual(['a (2).yaml', 'new.yaml']);
    expect(readFileSync(join(t.root, 'projects/alpha/a.yaml'), 'utf8')).toBe(ont('A'));
    expect(readFileSync(join(t.root, 'projects/alpha/a (2).yaml'), 'utf8')).toBe(ont('Replaced'));
    await api(t, 'POST', '/api/projects/alpha/import', {
      files: [{ path: 'a.yaml', source: ont('Replaced') }],
      onConflict: 'replace',
    });
    expect(readFileSync(join(t.root, 'projects/alpha/a.yaml'), 'utf8')).toBe(ont('Replaced'));
    expect(
      (await api(t, 'POST', '/api/projects/alpha/import', { files, onConflict: 'merge' })).status,
    ).toBe(400);
    expect(
      (
        await api(t, 'POST', '/api/projects/alpha/import', {
          files: [{ path: 'bad.yaml', source: 'ontology: []' }],
        })
      ).status,
    ).toBe(400);
    expect(t.ws.journal.pending()).toEqual([]);
  } finally {
    t.dispose();
  }
});
