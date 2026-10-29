// Tests metric endpoints and compatibility with their older aliases.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, parseDocument } from 'yaml';
import { sha256 } from '../src/server/projects/atomic';
import { extensionOf } from '../src/shared/edit/item-model';
import { LOCAL_READER } from '../src/server/projects/reader';
import { testWorkspace } from './helpers/temp-data-dir';
// Metrics endpoints: GET lists every metric with `governed`; POST `metrics` and `metrics/preview`
// behave exactly like the `kpis` aliases.
const api = (workspace: { handler: (request: Request) => Promise<Response> }, method: string, path: string, body?: unknown) =>
  workspace.handler(
    new Request('http://127.0.0.1:4310' + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
async function mall() {
  const workspace = await testWorkspace();
  const { slug } = await workspace.ws.loadExample('mall');
  const read = (p: string) => readFileSync(join(workspace.root, 'projects', slug, p), 'utf8');
  return { workspace, slug, read };
}
test('GET metrics lists every metric of the project, each with governed true exactly when it has workbench attributes', async () => {
  const { workspace, slug, read } = await mall();
  try {
    const list = await (await api(workspace, 'GET', `/api/projects/${slug}/metrics`)).json();
    const model = parse(read('mall.semantic.yaml'));
    const all = model.metrics.map((m: any) => m.name);
    expect(list.map((m: any) => m.name).sort()).toEqual([...all].sort());
    for (const metric of list) {
      expect(typeof metric.governed).toBe('boolean');
      expect(metric.governed).toBe(!!extensionOf(model.metrics.find((x: any) => x.name === metric.name)));
    }
    expect(list.filter((m: any) => m.governed)).toHaveLength(25);
  } finally {
    workspace.dispose();
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
  const metricsProject = await mall();
  const kpisProject = await mall();
  try {
    const hashes = (project: typeof metricsProject) => Object.fromEntries(['mall.semantic.yaml', 'mall.mapping.yaml'].map(p => [p, sha256(project.read(p))]));
    const pa = await (await api(metricsProject.workspace, 'POST', `/api/projects/${metricsProject.slug}/metrics/preview`, body(hashes(metricsProject)))).json();
    const pb = await (await api(kpisProject.workspace, 'POST', `/api/projects/${kpisProject.slug}/kpis/preview`, body(hashes(kpisProject)))).json();
    expect(pa).toEqual(pb);
    const ra = await api(metricsProject.workspace, 'POST', `/api/projects/${metricsProject.slug}/metrics`, body(hashes(metricsProject)));
    const rb = await api(kpisProject.workspace, 'POST', `/api/projects/${kpisProject.slug}/kpis`, body(hashes(kpisProject)));
    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);
    for (const path of ['mall.semantic.yaml', 'mall.mapping.yaml']) expect(metricsProject.read(path)).toBe(kpisProject.read(path));
  } finally {
    metricsProject.workspace.dispose();
    kpisProject.workspace.dispose();
  }
}, 30_000);
// Every shipped metric has attributes, so this project holds the commerce model with the first
// metric's attributes removed.
async function projectWithUngovernedMetric(workspace: Awaited<ReturnType<typeof testWorkspace>>) {
  const model = parseDocument(readFileSync('public/examples/commerce/sales.ossie.yaml', 'utf8'));
  model.deleteIn(['metrics', 0, 'custom_extensions']);
  const files = [{ path: 'sales.ossie.yaml', source: model.toString() }];
  return workspace.ws.importBatch({ files }, LOCAL_READER);
}
test('Add attributes: an existing metric without attributes gains only its extension; its expression and every other line keep their bytes', async () => {
  const workspace = await testWorkspace();
  const { slug } = await projectWithUngovernedMetric(workspace);
  try {
    const read = (p: string) => readFileSync(join(workspace.root, 'projects', slug, p), 'utf8');
    const before = read('sales.ossie.yaml');
    const list = await (await api(workspace, 'GET', `/api/projects/${slug}/metrics`)).json();
    const target = list.find((m: any) => !m.governed);
    expect(target).toBeTruthy();
    const response = await api(workspace, 'POST', `/api/projects/${slug}/metrics`, {
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
    expect(response.status).toBe(200);
    const after = read('sales.ossie.yaml');
    const originalLines = before.split('\n');
    const editedLines = after.split('\n');
    let prefixLength = 0;
    while (originalLines[prefixLength] === editedLines[prefixLength]) prefixLength++;
    let suffixLength = 0;
    while (
      suffixLength < originalLines.length - prefixLength &&
      suffixLength < editedLines.length - prefixLength &&
      originalLines[originalLines.length - 1 - suffixLength] === editedLines[editedLines.length - 1 - suffixLength]
    )
      suffixLength++;
    expect(originalLines.length - prefixLength - suffixLength).toBe(0); // Only added lines.
    const metric = parse(after).metrics.find((m: any) => m.name === target.name);
    expect(extensionOf(metric)!.value.owner).toBe('Sales');
    expect(parse(after).metrics.find((m: any) => m.name === target.name).expression).toEqual(parse(before).metrics.find((m: any) => m.name === target.name).expression);
    expect((await (await api(workspace, 'GET', `/api/projects/${slug}/metrics`)).json()).find((m: any) => m.name === target.name).governed).toBe(true);
    // A second Add attributes is refused.
    const again = await api(workspace, 'POST', `/api/projects/${slug}/metrics`, {
      semanticPath: 'sales.ossie.yaml',
      existing: true,
      metric: { name: target.name, expression: '' },
      extension: { schema: 'semantic-workbench/metric/v1', type: 'simple' },
      baseHashes: { 'sales.ossie.yaml': sha256(after) },
    });
    expect(again.status).toBe(400);
  } finally {
    workspace.dispose();
  }
}, 30_000);
