// Tests mapping kinds and metric bindings without changing existing agent context fields.
import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { testWorkspace } from './helpers/temp-data-dir';
import { LOCAL_READER } from '../src/server/projects/reader';
import { agentCatalogPath, agentContextPath } from '../src/app/mappings/agent-paths';
// Only binding kinds and metric bindings may extend the existing agent context. The remaining
// fields must match the saved digests; UPDATE_GOLDEN=1 deliberately replaces them.
const req = (path: string) => new Request('http://localhost' + path);
const stable = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map(stable);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(k => [k, stable(value[k])]),
    );
  }
  return value;
};
function withoutAdditions(agentContext: any) {
  const { metricBindings, ...rest } = agentContext;
  void metricBindings;
  return { ...rest, bindings: agentContext.bindings.map(({ kind, ...binding }: any) => (void kind, binding)) };
}
const digest = (c: any) =>
  createHash('sha256')
    .update(JSON.stringify(stable(withoutAdditions(c))))
    .digest('hex');
const goldenFile = 'tests/fixtures/agent-context/digests.json';
const golden: Record<string, string> = existsSync(goldenFile) ? JSON.parse(readFileSync(goldenFile, 'utf8')) : {};
async function contexts(example: string) {
  const workspace = await testWorkspace();
  const { slug } = await workspace.ws.loadExample(example);
  const catalog = await (await workspace.handler(req(agentCatalogPath(slug)))).json();
  const out: { id: string; filename: string; embedded: boolean; context: any }[] = [];
  for (const mapping of catalog.mappings) {
    const response = await workspace.handler(req(agentContextPath(slug, mapping.id)));
    expect(response.status).toBe(200);
    out.push({
      id: mapping.id,
      filename: mapping.filename,
      embedded: mapping.embedded,
      context: await response.json(),
    });
  }
  workspace.dispose();
  return out;
}
const all: Record<string, Awaited<ReturnType<typeof contexts>>> = {};
for (const example of ['mapped-commerce', 'flights', 'billing', 'mall']) all[example] = await contexts(example);
test('other context fields are unchanged (digest of legacy output)', () => {
  const now: Record<string, string> = {};
  for (const [example, list] of Object.entries(all))
    for (const contextEntry of list) now[`${example}:${contextEntry.filename}${contextEntry.embedded ? '#embedded' : ''}`] = digest(contextEntry.context);
  if (!existsSync(goldenFile) || process.env.UPDATE_GOLDEN) writeFileSync(goldenFile, JSON.stringify(now, null, 1) + '\n');
  expect(now).toEqual(JSON.parse(readFileSync(goldenFile, 'utf8')));
  expect(Object.keys(now).length).toBeGreaterThanOrEqual(5);
  void golden;
});
test('every binding has a kind; links, referents and objects are told apart (mapped commerce)', () => {
  const context = all['mapped-commerce'].find(x => x.filename === 'commerce.mapping.yaml')!.context;
  expect(context.bindings.length).toBeGreaterThan(0);
  for (const binding of context.bindings) expect(['object', 'referent', 'link']).toContain(binding.kind);
  const at = (path: (string | number)[]) => context.bindings.find((b: any) => JSON.stringify(b.evidence.path.slice(0, -1)) === JSON.stringify(path));
  // Customer's object mapping identifies it by a referent; a link mapping's child names Region.
  expect(at(['concept_mappings', 0, 'object_mappings', 0, 'referent_mappings', 0]).kind).toBe('referent');
  expect(at(['concept_mappings', 0, 'link_mappings', 0, 'children', 0, 'object_mapping']).kind).toBe('link');
  expect(at(['concept_mappings', 0, 'link_mappings', 0, 'children', 0, 'object_mapping']).relationships).toEqual(['region']);
  // Inside a link, the identifying referent of the linked object is part of the link.
  expect(at(['concept_mappings', 1, 'link_mappings', 0, 'children', 1, 'object_mapping', 'referent_mappings', 0]).kind).toBe('link');
  expect(at(['concept_mappings', 2, 'object_mappings', 0]).kind).toBe('object');
});
test('embedded mappings (Flights consolidated) carry kinds too, and the same kinds as the standalone mapping', () => {
  const embedded = all.flights.find(x => x.embedded)!.context;
  const standalone = all.flights.find(x => x.filename === 'flights.mapping.yaml')!.context;
  for (const binding of embedded.bindings) expect(['object', 'referent', 'link']).toContain(binding.kind);
  const kinds = (c: any) => c.bindings.map((b: any) => `${b.concept}|${b.expression}|${b.kind}`).sort();
  expect(kinds(embedded).length).toBeGreaterThan(0);
  expect(new Set(kinds(embedded).map((k: string) => k.split('|')[2]))).toEqual(new Set(kinds(standalone).map((k: string) => k.split('|')[2])));
});
test("metricBindings: the mall mapping's KPI bindings resolve to metric ids and concepts, with findings", () => {
  const context = all.mall.find(x => x.filename === 'mall.mapping.yaml')!.context;
  expect(Array.isArray(context.metricBindings)).toBe(true);
  expect(context.metricBindings.length).toBeGreaterThan(5);
  const billed = context.metricBindings.find((m: any) => m.metric === 'billed_amount');
  expect(billed).toMatchObject({
    metric: 'billed_amount',
    measures: { input: 'kpi:BilledAmount' },
    of: { input: 'Lease', concept: 'Lease' },
    findings: [],
  });
  expect(context.metrics.some((m: any) => m.id === 'billed_amount')).toBe(true);
  for (const metricBinding of context.metricBindings) {
    expect(Array.isArray(metricBinding.findings)).toBe(true);
    expect(metricBinding.evidence.filename).toBe('mall.mapping.yaml');
  }
  // Without a SEMANTIC_WORKBENCH extension the list is empty, never missing.
  const upstreamFlights = all.flights.filter(x => x.filename !== 'flights.metrics.mapping.yaml');
  expect(upstreamFlights).toHaveLength(2);
  for (const x of upstreamFlights) expect(x.context.metricBindings).toEqual([]);
});
test('the mappings that ship metric bindings list one resolved binding per metric', () => {
  const shipped: [string, string, number][] = [
    ['mapped-commerce', 'commerce.mapping.yaml', 4],
    ['billing', 'billing.mapping.yaml', 8],
    ['flights', 'flights.metrics.mapping.yaml', 7],
  ];
  for (const [example, filename, expectedBindingCount] of shipped) {
    const context = all[example].find(x => x.filename === filename)!.context;
    expect(context.metricBindings).toHaveLength(expectedBindingCount);
    for (const binding of context.metricBindings) {
      expect(binding.findings).toEqual([]);
      expect(binding.measures.concept).toBeTruthy();
    }
  }
});
test('metricBindings findings: an unknown metric or concept is reported on its binding, not in the context findings', async () => {
  const workspace = await testWorkspace();
  const { slug } = await workspace.ws.loadExample('mall');
  const file = workspace.ws.readFile(slug, 'mall.mapping.yaml');
  await workspace.ws.saveFile(
    slug,
    'mall.mapping.yaml',
    {
      baseHash: file.hash,
      source: file.source.replace('{"metric":"billed_amount","measures":"kpi:BilledAmount","of":"Lease"}', '{"metric":"no_such_metric","measures":"kpi:BilledAmount","of":"NoSuchConcept"}'),
    },
    LOCAL_READER,
  );
  const catalog = await (await workspace.handler(req(agentCatalogPath(slug)))).json();
  const id = catalog.mappings.find((m: any) => m.filename === 'mall.mapping.yaml').id;
  const agentContext = await (await workspace.handler(req(agentContextPath(slug, id)))).json();
  const bad = agentContext.metricBindings.find((m: any) => m.metric === 'no_such_metric');
  expect(bad.findings.map((f: any) => f.message).join(' ')).toContain('no_such_metric');
  expect(bad.findings.map((f: any) => f.message).join(' ')).toContain('NoSuchConcept');
  expect(bad.of.concept).toBeNull();
  expect(agentContext.findings.some((f: any) => /no_such_metric/.test(f.message))).toBe(false);
  workspace.dispose();
});
