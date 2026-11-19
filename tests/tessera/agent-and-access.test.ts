// Proves agents never see notes or the attribute order, see item context and the status flag only through the agent view, that access rules treat a Tessera ontology like its unmarked twin, and that an unmarked file with a lookalike property is judged by the pinned schema only.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import { agentCatalog, buildContext, planQuery, selectContext, type StoredDocument } from '../../src/server/agent/runtime';
import { explainMetric, projectMetrics } from '../../src/server/agent/explain';
import { createAccessControl } from '../../src/server/auth/authorize';
import { indexBytes } from '../../src/server/projects/scanner';
import { validateInput } from '../../src/shared/validation/input';
import { accessFixture, person } from '../auth/access-fixture';

const NOTE_TEXT = 'SECRET-NOTE-FOR-AUTHORS-ONLY';
const read = (name: string) => readFileSync(`public/examples/commerce/${name}`, 'utf8');

function withNotes(source: string): string {
  const document = parseDocument(source);
  document.set('tessera', 1);
  document.set('tessera_notes', `${NOTE_TEXT} root`);
  document.setIn(['ontology', 0, 'tessera_notes'], `${NOTE_TEXT} concept`);
  for (const [index, concept] of (document.toJS().ontology as any[]).entries()) {
    if (Array.isArray(concept.relationships) && concept.relationships.length) {
      document.setIn(['ontology', index, 'relationships', 0, 'tessera_notes'], `${NOTE_TEXT} relationship`);
      break;
    }
  }
  return document.toString({ lineWidth: 0 });
}

function documents(ontology: string): StoredDocument[] {
  const files = [
    { filename: 'commerce.mapping.yaml', source: read('commerce.mapping.yaml') },
    { filename: 'commerce.mapped-ontology.yaml', source: ontology },
    { filename: 'commerce.mapped-semantic.yaml', source: read('commerce.mapped-semantic.yaml') },
  ];
  return files.map(file => ({ id: `p/${file.filename}`, project: 'p', path: file.filename, filename: file.filename, revision: 1, source: file.source }) as StoredDocument);
}

const ORDER_MARKER = 'region';

/** The commerce ontology with an order list, an item context and a status, which the agent view treats differently. */
function withAttributeOrderAndContext(source: string): string {
  const document = parseDocument(source);
  document.set('tessera', 2);
  const customer = (document.toJS().ontology as any[]).findIndex(concept => concept.concept === 'Customer');
  document.setIn(['ontology', customer, 'tessera_attributes'], [ORDER_MARKER, 'id']);
  document.setIn(['ontology', customer, 'tessera_ai_context'], 'CONTEXT-FOR-AGENTS');
  document.setIn(['ontology', customer, 'tessera_governance'], { status: 'proposed', owner: 'OWNER-FOR-AUTHORS-ONLY' });
  return document.toString({ lineWidth: 0 });
}

const twin = documents(read('commerce.mapped-ontology.yaml'));
const marked = documents(withNotes(read('commerce.mapped-ontology.yaml')));

test('the marked fixture really is a valid Tessera document with notes', () => {
  const result = validateInput(marked[1].source, marked[1].filename);
  expect(result.valid).toBe(true);
  expect(marked[1].source).toContain(NOTE_TEXT);
});

test('the order list never reaches an agent, while the item context and the status flag do', () => {
  const docs = documents(withAttributeOrderAndContext(read('commerce.mapped-ontology.yaml')));
  const context = buildContext(docs, docs[0].id);
  const text = JSON.stringify(context);
  expect(text).toContain('CONTEXT-FOR-AGENTS');
  expect(text).toContain('"governance":{"status":"proposed"}');
  expect(text).not.toContain('OWNER-FOR-AUTHORS-ONLY');
  expect(text).not.toContain('tessera_attributes');
  const customer = context.concepts.find(concept => concept.concept === 'Customer');
  expect(Object.keys(customer).sort()).toEqual(['ai_context', 'concept', 'description', 'governance', 'identify_by', 'relationships', 'type']);
});

test('the agent catalog, context, selection, plan and metric explanation equal those of the unmarked twin and hold no note', () => {
  const mappingId = twin[0].id;
  const outputs = (docs: StoredDocument[]) => {
    const context = buildContext(docs, mappingId);
    const plan = planQuery(context, { mappingId, metrics: ['gross_revenue'], dimensions: [JSON.stringify(['customers', 'region'])] });
    return {
      catalog: agentCatalog(docs),
      context,
      selected: selectContext(context, ['Customer']),
      plan,
      metrics: projectMetrics(docs, 'p'),
      explanation: explainMetric(docs, 'p', 'commerce.mapped-semantic.yaml', 'gross_revenue'),
    };
  };
  const fromMarked = outputs(marked);
  const fromTwin = outputs(twin);
  expect(fromMarked).toEqual(fromTwin);
  expect(JSON.stringify(fromMarked)).not.toContain(NOTE_TEXT);
  expect(fromTwin.context.concepts.length).toBeGreaterThan(0);
});

function accessWith(docTypes: string[]) {
  const options = accessFixture();
  options.config.roles = [
    {
      id: 'r_ontology',
      name: 'Ontology editor',
      description: '',
      createdBy: 'test',
      createdAt: '2026-10-21T00:00:00Z',
      permissions: [{ actions: ['read'] }, { actions: ['edit'], conditions: { docType: docTypes } }],
    },
  ];
  options.config.grants = [{ id: 'g', roleId: 'r_ontology', member: { kind: 'email', email: 'alice@example.org' }, scope: { kind: 'workspace' }, addedBy: 'test', addedAt: '2026-10-21T00:00:00Z' }];
  const access = createAccessControl(options);
  return { access, alice: access.principalFor(person('alice')) };
}

function fileOf(source: string, path: string) {
  const indexed = indexBytes('sales-contracts', path, new TextEncoder().encode(source));
  return { type: 'file' as const, project: 'sales-contracts', path, docType: indexed.file.docType };
}

// A role condition names a document type with a lower-case identifier, so these are the types it can ask for. The file's own type is "Ossie ontology" for both files.
test('access rules that name document types allow and deny the same saves for the Tessera file and its twin', () => {
  const markedFile = fileOf(marked[1].source, 'marked.ontology.yaml');
  const twinFile = fileOf(twin[1].source, 'twin.ontology.yaml');
  expect(markedFile.docType).toBe('Ossie ontology');
  expect(markedFile.docType).toBe(twinFile.docType);
  for (const docTypes of [['metric'], ['contract'], ['ontology'], ['metric', 'contract']]) {
    const { access, alice } = accessWith(docTypes);
    const forMarked = access.authorize(alice, 'edit', markedFile);
    const forTwin = access.authorize(alice, 'edit', twinFile);
    expect(forMarked.allow, docTypes.join()).toBe(forTwin.allow);
    expect(forMarked.status, docTypes.join()).toBe(forTwin.status);
  }
});

test('an unmarked file with a tessera_notes key is judged by the pinned schema only', () => {
  const source = readFileSync('tests/fixtures/tessera/documents/lookalike-unmarked.yaml', 'utf8');
  const result = validateInput(source, 'lookalike.ontology.yaml');
  expect(result.valid).toBe(false);
  expect(result.issues.map(issue => issue.code)).toEqual(['schema']);
  const renamed = validateInput(source.replace('tessera_notes', 'another_notes'), 'lookalike.ontology.yaml');
  expect(renamed.issues.map(issue => [issue.code, issue.message])).toEqual(result.issues.map(issue => [issue.code, issue.message]));
});
