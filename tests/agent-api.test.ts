// Tests grounded queries and reference diagnostics through the agent API.
import { test, expect } from 'bun:test';
import { testWorkspace } from './helpers/temp-data-dir';
async function fixture() {
  const t = await testWorkspace();
  for (const file of [
    'commerce.mapping.yaml',
    'commerce.mapped-ontology.yaml',
    'commerce.mapped-semantic.yaml',
  ])
    await t.ws.saveDocument(file, await Bun.file('public/examples/commerce/' + file).text());
  return t;
}
const req = (path: string, body?: any) =>
  new Request(
    'http://localhost' + path,
    body !== undefined ? { method: 'POST', body: JSON.stringify(body) } : {},
  );
test('agent discovers layers and generates a new grounded query through the real HTTP API', async () => {
  const t = await fixture();
  try {
    const handler = t.handler;
    const before = t.ws.documents();
    const catalog = await (await handler(req('/api/agent/catalog'))).json();
    expect(catalog.mappings).toHaveLength(1);
    const id = catalog.mappings[0].id;
    expect(id).toBe('ungrouped/commerce.mapping.yaml');
    const context = await (
      await handler(req('/api/agent/context?mappingId=' + encodeURIComponent(id)))
    ).json();
    expect(
      context.bindings.some(
        (b: any) => b.rootConcept === 'Revenue' && b.metrics.includes('gross_revenue'),
      ),
    ).toBe(true);
    expect(context.aiContext.length).toBe(2);
    const response = await handler(
      req('/api/agent/plan', {
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
    const focused = await (
      await handler(
        req('/api/agent/context?mappingId=' + encodeURIComponent(id) + '&concept=Revenue'),
      )
    ).json();
    expect(focused.metrics.map((m: any) => m.name)).toEqual(['gross_revenue']);
    expect(
      focused.bindings.every((b: any) => b.rootConcept === 'Revenue' || b.concept === 'Revenue'),
    ).toBe(true);
  } finally {
    t.dispose();
  }
});
test('agent requests cannot override metrics, inject expressions or select unknown ids', async () => {
  const t = await fixture();
  try {
    const h = t.handler;
    const catalog = await (await h(req('/api/agent/catalog'))).json();
    const id = catalog.mappings[0].id;
    const valid = { mappingId: id, metrics: ['gross_revenue'], dimensions: [] };
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
    expect((await h(req('/api/agent/context'))).status).toBe(400);
    expect((await h(req('/api/agent/context?mappingId=missing'))).status).toBe(400);
    const tooLarge = await h(
      new Request('http://localhost/api/agent/plan', { method: 'POST', body: 'x'.repeat(64001) }),
    );
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
    const catalog = await (await h(req('/api/agent/catalog'))).json();
    const id = catalog.mappings[0].id;
    const ontology = t.ws.documents().find(d => d.filename === 'commerce.mapped-ontology.yaml')!;
    await t.ws.saveDocument(
      ontology.filename,
      ontology.source.replace('Mapped commerce ontology', 'Renamed ontology'),
      ontology.id,
      { revision: ontology.revision },
    );
    const c = await (await h(req('/api/agent/context?mappingId=' + encodeURIComponent(id)))).json();
    expect(c.findings.some((f: any) => f.code === 'reference')).toBe(true);
    const r = await h(
      req('/api/agent/plan', { mappingId: id, metrics: ['gross_revenue'], dimensions: [] }),
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
    const c = await t.handler(req('/api/agent/context?mappingId=old-uuid'));
    expect(c.status).toBe(200);
    expect((await c.json()).mappingId).toBe('ungrouped/commerce.mapping.yaml');
  } finally {
    t.dispose();
  }
});
