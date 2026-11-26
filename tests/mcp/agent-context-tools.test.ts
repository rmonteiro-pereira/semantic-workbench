// The published-context, plan and explanation tools carry item context and the status flag from the published
// snapshot, and never the owner, steward, classification or notes an author keeps on an item.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { startLocalServer, type LocalServer } from './helpers/local-server';

const PROJECT = 'mapped-commerce';
const FIXTURE = 'tests/fixtures/tessera/additions/project';
const ONTOLOGY_PATH = 'retail.mapped-ontology.yaml';
const MODEL_PATH = 'retail.mapped-semantic.yaml';
const MAPPING_PATH = 'retail.mapping.yaml';
const NOTE_TEXT = 'NOTE-FOR-AUTHORS-ONLY';

// Each private governance field with a value that appears nowhere else in the project, so its absence is checked by name and by text.
const PRIVATE_FIELDS: Record<string, string> = {
  owner: 'dana@example.com',
  steward: 'eli@example.com',
  classification: 'internal',
  notes: NOTE_TEXT,
};
// Metrics keep their own public owner (a team name such as Finance) from the metric extension, so the
// owner key is judged only inside the governance flags, where an item owner would leak.
const GOVERNANCE_KEYS = ['governance', 'conceptGovernance'];

let server: LocalServer;
let client: Awaited<ReturnType<LocalServer['connect']>>;

async function call(name: string, args: Record<string, unknown>): Promise<any> {
  return ((await client.callTool({ name, arguments: args })) as any).structuredContent;
}

/** Posts to a project route the way the browser does, as the person who runs the local server. */
async function postProject(route: string, body: object) {
  const headers = { host: `127.0.0.1:${server.port}`, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
  const response = await server.handler(new Request(`${server.url}/api/projects/${PROJECT}/${route}`, { method: 'POST', headers, body: JSON.stringify(body) }));
  if (response.status !== 200) throw new Error(`${route}: ${response.status} ${await response.text()}`);
}

/** The fixture ontology with an author note on the customer, which only authors may read. */
function ontologyWithNote(): string {
  const source = readFileSync(`${FIXTURE}/ontology.yaml`, 'utf8');
  return source.replace('    description: A person who buys.\n', `    description: A person who buys.\n    tessera_notes: ${NOTE_TEXT}\n`);
}

async function createFixtureFiles() {
  const files = [
    { path: ONTOLOGY_PATH, source: ontologyWithNote() },
    { path: MODEL_PATH, source: readFileSync(`${FIXTURE}/semantic-model.yaml`, 'utf8') },
    { path: MAPPING_PATH, source: readFileSync(`${FIXTURE}/mapping.yaml`, 'utf8') },
  ];
  for (const file of files) {
    const created = await call('create_file', { project: PROJECT, ...file });
    if (!created.ok) throw new Error(`create_file ${file.path}: ${JSON.stringify(created.error)}`);
  }
}

beforeAll(async () => {
  server = await startLocalServer({ examples: ['mapped-commerce'] });
  client = await server.connect();
  await createFixtureFiles();
  await postProject('git/commit', { message: 'Add the governed retail project', paths: [ONTOLOGY_PATH, MODEL_PATH, MAPPING_PATH] });
  await postProject('git/publish', {});
}, 120_000);

afterAll(async () => {
  await server.close();
});

async function retailMappingId(): Promise<string> {
  const catalog = await call('get_mapping_catalog', { project: PROJECT });
  const mapping = catalog.data.items.find((item: { id: string }) => item.id.endsWith(MAPPING_PATH));
  if (!mapping) throw new Error('The retail mapping is missing from the published catalog.');
  return mapping.id;
}

/** Collects every key at any depth of a JSON value. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
}

/** Collects every key inside the governance flags of an answer, at any depth. */
function governanceKeysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(governanceKeysOf);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => (GOVERNANCE_KEYS.includes(key) ? keysOf(child) : governanceKeysOf(child)));
}

function expectNoPrivateField(answer: unknown) {
  const keys = keysOf(answer);
  const governanceKeys = governanceKeysOf(answer);
  const text = JSON.stringify(answer).toLowerCase();
  for (const [field, value] of Object.entries(PRIVATE_FIELDS)) {
    expect(governanceKeys, field).not.toContain(field);
    if (field !== 'owner') expect(keys, field).not.toContain(field);
    expect(text, field).not.toContain(value.toLowerCase());
  }
}

test('the context tool carries published item context and the status flag, and no private field', async () => {
  const mappingId = await retailMappingId();
  const answer = await call('get_mapping_context', { project: PROJECT, mappingId });
  expect(answer.ok).toBe(true);
  const context = answer.data.context;
  const customerEntries = context.aiContext.filter((entry: { scope: string }) => entry.scope.endsWith('/concept:Customer'));
  expect(customerEntries.length).toBeGreaterThan(0);
  const flag = (name: string) => context.concepts.find((concept: { concept: string }) => concept.concept === name)?.governance;
  expect(flag('Customer')).toEqual({ status: 'deprecated', replacedBy: 'Account', reason: 'Customers are modelled as accounts from now on.' });
  expect(flag('Order')).toEqual({ status: 'approved' });
  expectNoPrivateField(answer);
});

test('the plan tool flags the items it uses and carries no private field', async () => {
  const mappingId = await retailMappingId();
  // The fixture mapping links fields, not metrics, to concepts, so the plan selects a mapped field.
  const dimensions = [JSON.stringify(['ORDERS', 'customer_id'])];
  const answer = await call('plan_query', { project: PROJECT, mappingId, concepts: ['Order', 'Customer'], metrics: [], dimensions });
  expect(answer.error).toBeUndefined();
  expect(answer.ok).toBe(true);
  expect(answer.data.plan.governance).toContainEqual({ kind: 'concept', name: 'Order', status: 'approved' });
  expectNoPrivateField(answer);
});

test('the explanation tool flags the metric status and carries no private field', async () => {
  const answer = await call('explain_metric', { project: PROJECT, path: MODEL_PATH, metric: 'revenue_old' });
  expect(answer.ok).toBe(true);
  expect(JSON.stringify(answer.data)).toContain('deprecated');
  expectNoPrivateField(answer);
});

test('an unpublished edit to item context does not reach the tools', async () => {
  const mappingId = await retailMappingId();
  const current = await call('read_file', { project: PROJECT, path: ONTOLOGY_PATH });
  const edited = current.data.text.replace('Use the account concept for new questions.', 'UNPUBLISHED-CONTEXT-MARKER');
  const saved = await call('save_file', { project: PROJECT, path: ONTOLOGY_PATH, baseVersion: current.data.version, source: edited });
  expect(saved.ok).toBe(true);
  const answer = await call('get_mapping_context', { project: PROJECT, mappingId });
  expect(JSON.stringify(answer)).not.toContain('UNPUBLISHED-CONTEXT-MARKER');
  expect(JSON.stringify(answer)).toContain('Use the account concept for new questions.');
});
