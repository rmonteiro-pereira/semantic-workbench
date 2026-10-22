// Tests mapping kinds and metric bindings without changing existing agent context fields.
import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { testWorkspace } from './helpers/temp-data-dir';
import { LOCAL_READER } from '../server/projects/reader';
// Only binding kinds and metric bindings may extend the existing agent context. The remaining
// fields must match the saved digests; UPDATE_GOLDEN=1 deliberately replaces them.
const req = (path: string) => new Request('http://localhost' + path);
const stable = (v: any): any =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map(k => [k, stable(v[k])]),
        )
      : v;
function withoutAdditions(c: any) {
  const { metricBindings, ...rest } = c;
  void metricBindings;
  return { ...rest, bindings: c.bindings.map(({ kind, ...b }: any) => (void kind, b)) };
}
const digest = (c: any) =>
  createHash('sha256')
    .update(JSON.stringify(stable(withoutAdditions(c))))
    .digest('hex');
const goldenFile = 'tests/fixtures/agent-context/digests.json';
const golden: Record<string, string> = existsSync(goldenFile)
  ? JSON.parse(readFileSync(goldenFile, 'utf8'))
  : {};
async function contexts(example: string) {
  const t = await testWorkspace();
  await t.ws.loadExample(example);
  const catalog = await (await t.handler(req('/api/agent/catalog'))).json();
  const out: { id: string; filename: string; embedded: boolean; context: any }[] = [];
  for (const m of catalog.mappings) {
    const r = await t.handler(req('/api/agent/context?mappingId=' + encodeURIComponent(m.id)));
    expect(r.status).toBe(200);
    out.push({ id: m.id, filename: m.filename, embedded: m.embedded, context: await r.json() });
  }
  t.dispose();
  return out;
}
const all: Record<string, Awaited<ReturnType<typeof contexts>>> = {};
for (const example of ['mapped-commerce', 'flights', 'billing', 'mall'])
  all[example] = await contexts(example);
test('other context fields are unchanged (digest of legacy output)', () => {
  const now: Record<string, string> = {};
  for (const [example, list] of Object.entries(all))
    for (const c of list)
      now[`${example}:${c.filename}${c.embedded ? '#embedded' : ''}`] = digest(c.context);
  if (!existsSync(goldenFile) || process.env.UPDATE_GOLDEN)
    writeFileSync(goldenFile, JSON.stringify(now, null, 1) + '\n');
  expect(now).toEqual(JSON.parse(readFileSync(goldenFile, 'utf8')));
  expect(Object.keys(now).length).toBeGreaterThanOrEqual(5);
  void golden;
});
test('every binding has a kind; links, referents and objects are told apart (mapped commerce)', () => {
  const c = all['mapped-commerce'].find(x => x.filename === 'commerce.mapping.yaml')!.context;
  expect(c.bindings.length).toBeGreaterThan(0);
  for (const b of c.bindings) expect(['object', 'referent', 'link']).toContain(b.kind);
  const at = (path: (string | number)[]) =>
    c.bindings.find(
      (b: any) => JSON.stringify(b.evidence.path.slice(0, -1)) === JSON.stringify(path),
    );
  // Customer's object mapping identifies it by a referent; a link mapping's child names Region.
  expect(at(['concept_mappings', 0, 'object_mappings', 0, 'referent_mappings', 0]).kind).toBe(
    'referent',
  );
  expect(
    at(['concept_mappings', 0, 'link_mappings', 0, 'children', 0, 'object_mapping']).kind,
  ).toBe('link');
  expect(
    at(['concept_mappings', 0, 'link_mappings', 0, 'children', 0, 'object_mapping']).relationships,
  ).toEqual(['region']);
  // Inside a link, the identifying referent of the linked object is part of the link.
  expect(
    at([
      'concept_mappings',
      1,
      'link_mappings',
      0,
      'children',
      1,
      'object_mapping',
      'referent_mappings',
      0,
    ]).kind,
  ).toBe('link');
  expect(at(['concept_mappings', 2, 'object_mappings', 0]).kind).toBe('object');
});
test('embedded mappings (Flights consolidated) carry kinds too, and the same kinds as the standalone mapping', () => {
  const embedded = all.flights.find(x => x.embedded)!.context;
  const standalone = all.flights.find(x => x.filename === 'flights.mapping.yaml')!.context;
  for (const b of embedded.bindings) expect(['object', 'referent', 'link']).toContain(b.kind);
  const kinds = (c: any) =>
    c.bindings.map((b: any) => `${b.concept}|${b.expression}|${b.kind}`).sort();
  expect(kinds(embedded).length).toBeGreaterThan(0);
  expect(new Set(kinds(embedded).map((k: string) => k.split('|')[2]))).toEqual(
    new Set(kinds(standalone).map((k: string) => k.split('|')[2])),
  );
});
test("metricBindings: the mall mapping's KPI bindings resolve to metric ids and concepts, with findings", () => {
  const c = all.mall.find(x => x.filename === 'mall.mapping.yaml')!.context;
  expect(Array.isArray(c.metricBindings)).toBe(true);
  expect(c.metricBindings.length).toBeGreaterThan(5);
  const billed = c.metricBindings.find((m: any) => m.metric === 'billed_amount');
  expect(billed).toMatchObject({
    metric: 'billed_amount',
    measures: { input: 'kpi:BilledAmount' },
    of: { input: 'Lease', concept: 'Lease' },
    findings: [],
  });
  expect(c.metrics.some((m: any) => m.id === 'billed_amount')).toBe(true);
  for (const m of c.metricBindings) {
    expect(Array.isArray(m.findings)).toBe(true);
    expect(m.evidence.filename).toBe('mall.mapping.yaml');
  }
  // Without a SEMANTIC_WORKBENCH extension the list is empty, never missing.
  for (const x of [...all['mapped-commerce'], ...all.flights, ...all.billing])
    expect(x.context.metricBindings).toEqual([]);
});
test('metricBindings findings: an unknown metric or concept is reported on its binding, not in the context findings', async () => {
  const t = await testWorkspace();
  const { slug } = await t.ws.loadExample('mall');
  const f = t.ws.readFile(slug, 'mall.mapping.yaml');
  await t.ws.saveFile(
    slug,
    'mall.mapping.yaml',
    {
      baseHash: f.hash,
      source: f.source.replace(
        '{"metric":"billed_amount","measures":"kpi:BilledAmount","of":"Lease"}',
        '{"metric":"no_such_metric","measures":"kpi:BilledAmount","of":"NoSuchConcept"}',
      ),
    },
    LOCAL_READER,
  );
  const catalog = await (await t.handler(req('/api/agent/catalog'))).json();
  const id = catalog.mappings.find((m: any) => m.filename === 'mall.mapping.yaml').id;
  const c = await (
    await t.handler(req('/api/agent/context?mappingId=' + encodeURIComponent(id)))
  ).json();
  const bad = c.metricBindings.find((m: any) => m.metric === 'no_such_metric');
  expect(bad.findings.map((f: any) => f.message).join(' ')).toContain('no_such_metric');
  expect(bad.findings.map((f: any) => f.message).join(' ')).toContain('NoSuchConcept');
  expect(bad.of.concept).toBeNull();
  expect(c.findings.some((f: any) => /no_such_metric/.test(f.message))).toBe(false);
  t.dispose();
});
