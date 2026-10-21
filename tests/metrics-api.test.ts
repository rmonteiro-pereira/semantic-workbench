// Tests metric endpoints and compatibility with their older aliases.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { sha256 } from '../server/projects/atomic';
import { extensionOf } from '../src/edit/item-model';
import { testWorkspace } from './helpers/temp-data-dir';
// Metrics endpoints: GET lists every metric with `governed`; POST `metrics` and `metrics/preview`
// behave exactly like the `kpis` aliases.
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
async function mall() {
  const t = await testWorkspace();
  const { slug } = await t.ws.loadExample('mall');
  const read = (p: string) => readFileSync(join(t.root, 'projects', slug, p), 'utf8');
  return { t, slug, read };
}
test('GET metrics lists every metric of the project, each with governed true exactly when it has workbench attributes', async () => {
  const { t, slug, read } = await mall();
  try {
    const list = await (await api(t, 'GET', `/api/projects/${slug}/metrics`)).json();
    const model = parse(read('mall.semantic.yaml'));
    const all = model.metrics.map((m: any) => m.name);
    expect(list.map((m: any) => m.name).sort()).toEqual([...all].sort());
    for (const m of list) {
      expect(typeof m.governed).toBe('boolean');
      expect(m.governed).toBe(!!extensionOf(model.metrics.find((x: any) => x.name === m.name)));
    }
    expect(list.filter((m: any) => m.governed)).toHaveLength(25);
  } finally {
    t.dispose();
  }
}, 30_000);
const body = (hashes: Record<string, string>) => ({
  semanticPath: 'mall.semantic.yaml',
  metric: {
    name: 'vacancy_rate',
    expression: 'vacant_gla / NULLIF(total_gla, 0)',
    description: 'Vacant over total gross leasable area.',
  },
  extension: {
    schema: 'semantic-workbench/metric/v1',
    type: 'ratio',
    numerator: 'vacant_gla',
    denominator: 'total_gla',
    additivity: 'non_additive',
    unit: 'ratio',
    status: 'proposed',
    owner: 'Leasing',
  },
  binding: { measures: 'Property' },
  baseHashes: hashes,
});
test('POST metrics and metrics/preview equal the kpis aliases byte for byte', async () => {
  const a = await mall();
  const b = await mall();
  try {
    const hashes = (m: typeof a) =>
      Object.fromEntries(
        ['mall.semantic.yaml', 'mall.mapping.yaml'].map(p => [p, sha256(m.read(p))]),
      );
    const pa = await (
      await api(a.t, 'POST', `/api/projects/${a.slug}/metrics/preview`, body(hashes(a)))
    ).json();
    const pb = await (
      await api(b.t, 'POST', `/api/projects/${b.slug}/kpis/preview`, body(hashes(b)))
    ).json();
    expect(pa).toEqual(pb);
    const ra = await api(a.t, 'POST', `/api/projects/${a.slug}/metrics`, body(hashes(a)));
    const rb = await api(b.t, 'POST', `/api/projects/${b.slug}/kpis`, body(hashes(b)));
    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);
    for (const p of ['mall.semantic.yaml', 'mall.mapping.yaml']) expect(a.read(p)).toBe(b.read(p));
  } finally {
    a.t.dispose();
    b.t.dispose();
  }
}, 30_000);
test('Add attributes: an existing metric without attributes gains only its extension; its expression and every other line keep their bytes', async () => {
  const t = await testWorkspace();
  const { slug } = await t.ws.loadExample('commerce');
  try {
    const read = (p: string) => readFileSync(join(t.root, 'projects', slug, p), 'utf8');
    const before = read('sales.ossie.yaml');
    const list = await (await api(t, 'GET', `/api/projects/${slug}/metrics`)).json();
    const target = list.find((m: any) => !m.governed);
    expect(target).toBeTruthy();
    const r = await api(t, 'POST', `/api/projects/${slug}/metrics`, {
      semanticPath: 'sales.ossie.yaml',
      existing: true,
      metric: { name: target.name, expression: '' },
      extension: {
        schema: 'semantic-workbench/metric/v1',
        type: 'simple',
        additivity: 'additive',
        owner: 'Sales',
        status: 'proposed',
      },
      baseHashes: { 'sales.ossie.yaml': sha256(before) },
    });
    expect(r.status).toBe(200);
    const after = read('sales.ossie.yaml');
    const a = before.split('\n');
    const b = after.split('\n');
    let p = 0;
    while (a[p] === b[p]) p++;
    let s = 0;
    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    expect(a.length - p - s).toBe(0); // Only added lines.
    const metric = parse(after).metrics.find((m: any) => m.name === target.name);
    expect(extensionOf(metric)!.value.owner).toBe('Sales');
    expect(parse(after).metrics.find((m: any) => m.name === target.name).expression).toEqual(
      parse(before).metrics.find((m: any) => m.name === target.name).expression,
    );
    expect(
      (await (await api(t, 'GET', `/api/projects/${slug}/metrics`)).json()).find(
        (m: any) => m.name === target.name,
      ).governed,
    ).toBe(true);
    // A second Add attributes is refused.
    const again = await api(t, 'POST', `/api/projects/${slug}/metrics`, {
      semanticPath: 'sales.ossie.yaml',
      existing: true,
      metric: { name: target.name, expression: '' },
      extension: { schema: 'semantic-workbench/metric/v1', type: 'simple' },
      baseHashes: { 'sales.ossie.yaml': sha256(after) },
    });
    expect(again.status).toBe(400);
  } finally {
    t.dispose();
  }
}, 30_000);
