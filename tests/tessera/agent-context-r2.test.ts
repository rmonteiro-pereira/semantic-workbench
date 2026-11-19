// Checks that agents read the item context and the status flag from the published snapshot only, and never owner, steward, classification, notes or the order list.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { documentForAgents } from '../../src/shared/tessera/agent-view';
import { parseDocument } from 'yaml';
import { buildContext, planQuery, selectContext, type StoredDocument } from '../../src/server/agent/runtime';
import { explainMetric } from '../../src/server/agent/explain';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { publishFixture } from '../helpers/published-workspace';
import { testWorkspace } from '../helpers/temp-data-dir';

const origin = 'http://localhost:5173';
const read = (name: string) => readFileSync(`public/examples/commerce/${name}`, 'utf8');
const PRIVATE_TEXT = ['OWNER-DANA', 'STEWARD-ELI', 'CLASS-INTERNAL', 'NOTE-FOR-AUTHORS'];

/** The commerce ontology with context, governance and the private additions on a few items. */
function governedOntology(): string {
  const document = parseDocument(read('commerce.mapped-ontology.yaml'));
  document.set('tessera', 2);
  const concepts = (document.toJS().ontology as any[]).map(concept => concept.concept);
  const at = (name: string) => concepts.indexOf(name);
  document.setIn(['ontology', at('Customer'), 'tessera_ai_context'], { instructions: 'Customers belong to one region.', synonyms: ['client'] });
  document.setIn(['ontology', at('Customer'), 'relationships', 1, 'tessera_ai_context'], 'The region used in revenue reports.');
  document.setIn(['ontology', at('Customer'), 'tessera_governance'], { status: 'approved', owner: PRIVATE_TEXT[0], steward: PRIVATE_TEXT[1], classification: PRIVATE_TEXT[2] });
  document.setIn(['ontology', at('Customer'), 'tessera_notes'], PRIVATE_TEXT[3]);
  document.setIn(['ontology', at('Customer'), 'tessera_attributes'], ['region', 'id']);
  document.setIn(['ontology', at('Order'), 'tessera_governance'], { status: 'proposed', owner: PRIVATE_TEXT[0] });
  document.setIn(['ontology', at('Region'), 'tessera_governance'], { status: 'deprecated', replaced_by: 'Customer', deprecation_reason: 'Regions are folded into customers.' });
  return document.toString({ lineWidth: 0 });
}

function storedDocuments(ontology: string): StoredDocument[] {
  const files = [
    { filename: 'commerce.mapping.yaml', source: read('commerce.mapping.yaml') },
    { filename: 'commerce.mapped-ontology.yaml', source: ontology },
    { filename: 'commerce.mapped-semantic.yaml', source: read('commerce.mapped-semantic.yaml') },
  ];
  return files.map(file => ({ id: `p/${file.filename}`, project: 'p', path: file.filename, filename: file.filename, revision: 1, source: file.source }) as StoredDocument);
}

const mappingId = 'p/commerce.mapping.yaml';
const governed = storedDocuments(governedOntology());
const plain = storedDocuments(read('commerce.mapped-ontology.yaml'));

test('the context holds the item context at item addresses and a flag for every item that carries governance', () => {
  const context = buildContext(governed, mappingId);
  const scopes = context.aiContext.map(entry => entry.scope);
  expect(scopes.some(scope => scope.endsWith('/concept:Customer'))).toBe(true);
  expect(scopes.some(scope => scope.endsWith('/concept:Customer/relationship:region'))).toBe(true);
  const flag = (name: string) => context.concepts.find(concept => concept.concept === name)?.governance;
  expect(flag('Customer')).toEqual({ status: 'approved' });
  expect(flag('Order')).toEqual({ status: 'proposed' });
  expect(flag('Region')).toEqual({ status: 'deprecated', replacedBy: 'Customer', reason: 'Regions are folded into customers.' });
  expect(flag('Money')).toBeUndefined();
});

test('no owner, steward, classification, note or order list reaches the context, a plan or an explanation', () => {
  const context = buildContext(governed, mappingId);
  const plan = planQuery(context, { mappingId, metrics: ['gross_revenue'], dimensions: [JSON.stringify(['customers', 'region'])] });
  const explanation = explainMetric(governed, 'p', 'commerce.mapped-semantic.yaml', 'gross_revenue');
  const projected = documentForAgents(parseDocument(governedOntology()).toJS());
  const text = JSON.stringify({ projected, context, plan, explanation, selected: selectContext(context, ['Customer']) });
  for (const secret of PRIVATE_TEXT) expect(text).not.toContain(secret);
  expect(text).not.toContain('tessera');
});

test('a plan and an explanation keep proposed and deprecated items and flag them', () => {
  const context = buildContext(governed, mappingId);
  const plan = planQuery(context, { mappingId, concepts: ['Customer', 'Order', 'Region'], metrics: ['gross_revenue'], dimensions: [JSON.stringify(['customers', 'region'])] });
  expect(plan.governance).toContainEqual({ kind: 'concept', name: 'Customer', status: 'approved' });
  expect(plan.governance?.some(flag => flag.name === 'Region' && flag.status === 'deprecated')).toBe(true);
  expect(plan.sql).toContain('SELECT');
  const explanation = explainMetric(governed, 'p', 'commerce.mapped-semantic.yaml', 'gross_revenue');
  expect(explanation.conceptGovernance?.some(flag => flag.concept === 'Customer' && flag.status === 'approved')).toBe(true);
});

/** Removes the new fields so the rest of the output can be compared with the unmarked twin. */
function withoutNewFields(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, item) => (['governance', 'conceptGovernance'].includes(key) ? undefined : item)));
}

test('an unmarked twin gives the same output apart from the new fields', () => {
  const outputs = (documents: StoredDocument[]) => {
    const context = buildContext(documents, mappingId);
    const plan = planQuery(context, { mappingId, metrics: ['gross_revenue'], dimensions: [JSON.stringify(['customers', 'region'])] });
    return { plan, explanation: explainMetric(documents, 'p', 'commerce.mapped-semantic.yaml', 'gross_revenue'), concepts: context.concepts.map(concept => concept.concept) };
  };
  expect(withoutNewFields(outputs(governed))).toEqual(withoutNewFields(outputs(plain)));
  const twin = outputs(plain);
  expect((twin.plan.governance ?? []).every(flag => flag.kind === 'metric')).toBe(true);
  expect('conceptGovernance' in twin.explanation).toBe(false);
});

test('the published snapshot answers the agent routes and unpublished context reaches only the preview', async () => {
  using fixture = await testWorkspace();
  const files = [
    ['commerce.mapping.yaml', read('commerce.mapping.yaml')],
    ['commerce.mapped-ontology.yaml', governedOntology()],
    ['commerce.mapped-semantic.yaml', read('commerce.mapped-semantic.yaml')],
  ];
  for (const [name, source] of files) await fixture.ws.saveDocument(name, source, LOCAL_READER);
  await publishFixture(fixture);
  const ask = async (prefix: string) =>
    (
      await fixture.handler(
        new Request(`${origin}/api/${prefix}/context?project=ungrouped&mappingId=ungrouped/commerce.mapping.yaml`, { headers: { Origin: origin, 'X-SW-Request': '1', 'Sec-Fetch-Site': 'same-site' } }),
      )
    ).text();
  const requestOutputs = async () => {
    const requests = [
      new Request(`${origin}/api/agent/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: 'ungrouped', mappingId: 'ungrouped/commerce.mapping.yaml', metrics: ['gross_revenue'], dimensions: [] }),
      }),
      new Request(`${origin}/api/projects/ungrouped/files/commerce.mapped-semantic.yaml/explain/gross_revenue`),
    ];
    return Promise.all(
      requests.map(async request => {
        const response = await fixture.handler(request);
        expect(response.status).toBe(200);
        return response.text();
      }),
    );
  };
  const before = await ask('agent');
  const outputsBefore = await requestOutputs();
  expect(before).toContain('Customers belong to one region.');
  const saved = fixture.ws.readFile('ungrouped', 'commerce.mapped-ontology.yaml', LOCAL_READER);
  await fixture.ws.saveFile(
    'ungrouped',
    'commerce.mapped-ontology.yaml',
    { baseHash: saved.hash, source: saved.source.replace('Customers belong to one region.', 'UNPUBLISHED-CONTEXT').replace('status: approved', 'status: proposed') },
    LOCAL_READER,
  );
  expect(await ask('agent')).toBe(before);
  expect(await requestOutputs()).toEqual(outputsBefore);
  expect(await ask('agent')).not.toContain('UNPUBLISHED-CONTEXT');
  expect(await ask('preview')).toContain('UNPUBLISHED-CONTEXT');
});
