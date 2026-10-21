import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from '../server/projects/atomic';
import { browserSqlFindings } from '../src/sql/browser';
import { testWorkspace } from './helpers/temp-data-dir';
// SQL findings through the API (T057; FR-052, FR-053): the file findings carry the same SQL
// warnings as the browser module (per-dialect grammar builds), and they never block a save.
const api = (
  t: { handler: (r: Request) => Promise<Response> },
  method: string,
  path: string,
  body?: unknown,
) =>
  t.handler(
    new Request('http://127.0.0.1:4310' + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
const fixture = (name: string) => readFileSync(`tests/fixtures/sql/${name}`, 'utf8');
const sqlOnly = (findings: any[]) =>
  findings
    .filter(f => f.code === 'sql')
    .map(({ severity, code, path, message, line, column }) => ({
      severity,
      code,
      path,
      message,
      line,
      column,
    }));
test("file findings include the browser module's SQL warnings; a file with SQL warnings saves and stays valid", async () => {
  const t = await testWorkspace();
  try {
    const names = [
      'case-when.ossie.yaml',
      'case-when-broken.ossie.yaml',
      'escaped.semantic.json',
      'folded.ossie.yaml',
      'quality.odcs.yaml',
      'dax.ossie.yaml',
    ];
    const r = await api(t, 'POST', '/api/import', {
      name: 'Sql',
      files: names.map(path => ({ path, source: fixture(path) })),
    });
    expect(r.status).toBe(200);
    const { slug } = await r.json();
    let warned = 0;
    for (const name of names) {
      const file = await (await api(t, 'GET', `/api/projects/${slug}/files/${name}`)).json();
      const browser = sqlOnly(await browserSqlFindings(fixture(name), name));
      expect([name, sqlOnly(file.findings)]).toEqual([name, browser]);
      warned += browser.length;
      expect(file.valid ?? true).toBe(true);
    }
    expect(warned).toBe(3);
    // Saving a new SQL error is accepted: warnings never block.
    const source = fixture('case-when.ossie.yaml');
    const broken = source.replace('ELSE 0 END)', 'ELSE 0)');
    const saved = await api(t, 'PUT', `/api/projects/${slug}/files/case-when.ossie.yaml`, {
      baseHash: sha256(source),
      source: broken,
    });
    expect(saved.status).toBe(200);
    expect(readFileSync(join(t.root, 'projects', slug, 'case-when.ossie.yaml'), 'utf8')).toBe(
      broken,
    );
    const after = await (
      await api(t, 'GET', `/api/projects/${slug}/files/case-when.ossie.yaml`)
    ).json();
    expect(sqlOnly(after.findings).map(f => [f.line, f.column])).toEqual([[23, 77]]);
  } finally {
    t.dispose();
  }
}, 60_000);
