// Tests grounded queries and reference diagnostics through the agent API.
import { LOCAL_READER } from '../src/server/projects/reader';
import { test, expect } from 'bun:test';
import { testWorkspace } from './helpers/temp-data-dir';
async function fixture() {
  const t = await testWorkspace();
  for (const file of ['commerce.mapping.yaml', 'commerce.mapped-ontology.yaml', 'commerce.mapped-semantic.yaml'])
    await t.ws.saveDocument(file, await Bun.file('public/examples/commerce/' + file).text(), LOCAL_READER);
  return t;
}
const PROJECT = 'ungrouped';
const req = (path: string, body?: any) => new Request('http://localhost' + path, body !== undefined ? { method: 'POST', body: JSON.stringify(body) } : {});
test('agent discovers layers and generates a new grounded query through the real HTTP API', async () => {
  const t = await fixture();
  try {
    const handler = t.handler;
    const before = t.ws.documents();
    const catalog = await (await handler(req(`/api/agent/catalog?project=${PROJECT}`))).json();
    expect(catalog.mappings).toHaveLength(1);
    const id = catalog.mappings[0].id;
    expect(id).toBe('ungrouped/commerce.mapping.yaml');
    const context = await (await handler(req(`/api/agent/context?project=${PROJECT}&mappingId=` + encodeURIComponent(id)))).json();
    expect(context.bindings.some((b: any) => b.rootConcept === 'Revenue' && b.metrics.includes('gross_revenue'))).toBe(true);
    expect(context.aiContext.length).toBe(2);
    const response = await handler(
      req('/api/agent/plan', {
        project: PROJECT,
        mappingId: id,
        concepts: ['Revenue', 'Customer'],
        metrics: ['gross_revenue'],
        dimensions: ['["customers","region"]'],
      }),
    );
    expect(response.status).toBe(200);
    const plan = await response.json();
    expect(plan.sql).toContain('GROUP BY');
    expect(plan.metrics[0].governedExpression.dialects[0].expression).toBe('SUM(orders.amount)');
    expect(plan.documents[0].documentId).toBe(id);
    expect(t.ws.documents()).toEqual(before);
    const focused = await (await handler(req(`/api/agent/context?project=${PROJECT}&mappingId=` + encodeURIComponent(id) + '&concept=Revenue'))).json();
    expect(focused.metrics.map((m: any) => m.name)).toEqual(['gross_revenue']);
    expect(focused.bindings.every((b: any) => b.rootConcept === 'Revenue' || b.concept === 'Revenue')).toBe(true);
  } finally {
    t.dispose();
  }
});
test('agent requests cannot override metrics, inject expressions or select unknown ids', async () => {
  const t = await fixture();
  try {
    const h = t.handler;
    const catalog = await (await h(req(`/api/agent/catalog?project=${PROJECT}`))).json();
    const id = catalog.mappings[0].id;
    const valid = { project: PROJECT, mappingId: id, metrics: ['gross_revenue'], dimensions: [] };
    for (const body of [
      null,
      [],
      {},
      { ...valid, expression: 'SUM(amount)*2' },
      { ...valid, metrics: [{ name: 'gross_revenue', expression: 'evil' }] },
      { ...valid, metrics: ['unknown'] },
      { ...valid, concepts: ['Missing'] },
      { ...valid, dimensions: 'customers.region' },
    ]) {
      const r = await h(req('/api/agent/plan', body));
      expect(r.status).toBe(400);
      expect((await r.json()).error).toBeTruthy();
    }
    expect((await h(req(`/api/agent/context?project=${PROJECT}`))).status).toBe(400);
    expect((await h(req(`/api/agent/context?project=${PROJECT}&mappingId=missing`))).status).toBe(400);
    const tooLarge = await h(new Request('http://localhost/api/agent/plan', { method: 'POST', body: 'x'.repeat(64001) }));
    expect(tooLarge.status).toBe(400);
    expect(t.ws.documents()).toHaveLength(3);
  } finally {
    t.dispose();
  }
});
test('reference diagnostics update immediately when referenced documents are saved', async () => {
  const t = await fixture();
  try {
    const h = t.handler;
    const catalog = await (await h(req(`/api/agent/catalog?project=${PROJECT}`))).json();
    const id = catalog.mappings[0].id;
    const ontology = t.ws.documents().find(d => d.filename === 'commerce.mapped-ontology.yaml')!;
    await t.ws.saveDocument(ontology.filename, ontology.source.replace('Mapped commerce ontology', 'Renamed ontology'), LOCAL_READER, ontology.id, { revision: ontology.revision });
    const c = await (await h(req(`/api/agent/context?project=${PROJECT}&mappingId=` + encodeURIComponent(id)))).json();
    expect(c.findings.some((f: any) => f.code === 'reference')).toBe(true);
    const r = await h(
      req('/api/agent/plan', {
        project: PROJECT,
        mappingId: id,
        metrics: ['gross_revenue'],
        dimensions: [],
      }),
    );
    expect(r.status).toBe(400);
  } finally {
    t.dispose();
  }
});
test('v0.1.0 document ids keep resolving for agent mapping ids', async () => {
  const t = await fixture();
  try {
    t.ws.state.writeLegacyIds({
      'old-uuid': { project: 'ungrouped', path: 'commerce.mapping.yaml' },
    });
    const c = await t.handler(req(`/api/agent/context?project=${PROJECT}&mappingId=old-uuid`));
    expect(c.status).toBe(200);
    expect((await c.json()).mappingId).toBe('ungrouped/commerce.mapping.yaml');
  } finally {
    t.dispose();
  }
});

test('an agent request names its project and never resolves references in another project', async () => {
  const t = await fixture();
  try {
    const mapping = t.ws.documents().find(d => d.filename === 'commerce.mapping.yaml')!;
    const ontology = t.ws.documents().find(d => d.filename === 'commerce.mapped-ontology.yaml')!;
    const semantic = t.ws.documents().find(d => d.filename === 'commerce.mapped-semantic.yaml')!;
    // The other project holds the definitions the mapping refers to; the mapping's project does not.
    await t.ws.importBatch(
      {
        name: 'Referenced',
        files: [
          { path: ontology.filename, source: ontology.source },
          { path: semantic.filename, source: semantic.source },
        ],
      },
      LOCAL_READER,
    );
    await t.ws.deleteFile(PROJECT, ontology.filename, LOCAL_READER);
    await t.ws.deleteFile(PROJECT, semantic.filename, LOCAL_READER);
    const id = mapping.id;
    const context = await (await t.handler(req(`/api/agent/context?project=${PROJECT}&mappingId=${encodeURIComponent(id)}`))).json();
    expect(context.findings.some((f: any) => f.code === 'reference')).toBe(true);
    expect((await t.handler(req('/api/agent/catalog'))).status).toBe(400);
    const unknown = await t.handler(req('/api/agent/catalog?project=missing'));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ error: 'Project not found.' });
    const other = await (await t.handler(req('/api/agent/catalog?project=referenced'))).json();
    expect(other.mappings).toEqual([]);
  } finally {
    t.dispose();
  }
});

test('agent requests refuse a missing or malformed project and a mapping of another project', async () => {
  const t = await fixture();
  try {
    await t.ws.importBatch(
      {
        name: 'Other',
        files: [
          {
            path: 'other.yaml',
            source: 'name: Other\nontology:\n  - concept: Item\n    type: EntityType\n',
          },
        ],
      },
      LOCAL_READER,
    );
    const id = 'ungrouped/commerce.mapping.yaml';
    const encoded = encodeURIComponent(id);
    const noProject = await t.handler(req(`/api/agent/context?mappingId=${encoded}`));
    expect(noProject.status).toBe(400);
    for (const project of [undefined, 7, '', null, ['ungrouped']]) {
      const plan = await t.handler(req('/api/agent/plan', { project, mappingId: id }));
      expect(plan.status).toBe(400);
    }
    const mismatched = await t.handler(req(`/api/agent/context?project=other&mappingId=${encoded}`));
    expect(mismatched.status).toBe(400);
    expect(await mismatched.json()).toEqual({
      error: 'mappingId belongs to project ungrouped, not other.',
    });
    const mismatchedPlan = await t.handler(req('/api/agent/plan', { project: 'other', mappingId: id, metrics: [], dimensions: [] }));
    expect(mismatchedPlan.status).toBe(400);
    const projects = await (await t.handler(req('/api/agent/projects'))).json();
    expect(projects.projects.map((p: { slug: string }) => p.slug)).toContain('other');
  } finally {
    t.dispose();
  }
});

test('an agent request without a project is refused before the mapping is looked at', async () => {
  const t = await fixture();
  try {
    const context = await t.handler(req('/api/agent/context?mappingId=missing/not-there.yaml'));
    expect(context.status).toBe(400);
    expect((await context.json()).error).toMatch(/^project is required/);
    const plan = await t.handler(req('/api/agent/plan', { mappingId: 'missing/not-there.yaml', metrics: [], dimensions: [] }));
    expect(plan.status).toBe(400);
    expect((await plan.json()).error).toMatch(/^project is required/);
  } finally {
    t.dispose();
  }
});
