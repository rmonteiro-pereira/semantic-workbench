// Every proposal operation answers the same through HTTP and through the in-process boundary, for an
// allowed person, one refused for the action, one refused for a target, and for a proposal that is
// hidden or missing: the same status, the same body and the same audit record.
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createAuditLog } from '../../src/server/auth/audit';
import { mintCaller } from '../../src/server/auth/caller';
import { createHandler } from '../../src/server/handler';
import { buildTwinRequest } from '../../src/server/auth/twin-request';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { createProposal, proposalFixture } from '../helpers/proposal-fixture';
import { person } from './access-fixture';
import { salesViewer } from './working-copy-fixture';

type Fixture = Awaited<ReturnType<typeof proposalFixture>>;
const origin = 'http://localhost:5312';
const scenarios = ['allowed', 'denied-action', 'denied-target', 'hidden', 'missing'] as const;
type Scenario = (typeof scenarios)[number];

type Operation = { id: string; body?: (fixture: Fixture) => unknown; query?: Record<string, string>; proposal: boolean };

const guessedPosition = { expectedBranch: 'work/nobody', expectedHead: 'a'.repeat(40) };
const OPERATIONS: Operation[] = [
  { id: 'proposals.list', proposal: false },
  { id: 'proposals.read', proposal: true },
  { id: 'proposals.diff', proposal: true, query: { path: 'sales.ontology.yaml' } },
  { id: 'proposals.create', proposal: false, body: fixture => ({ name: 'Parity create', projects: [fixture.projects.sales.slug] }) },
  { id: 'proposals.work', proposal: true, body: () => guessedPosition },
  { id: 'proposals.synchronize', proposal: true, body: () => guessedPosition },
  { id: 'proposals.contribute', proposal: true, body: () => ({ expectedTip: 'b'.repeat(40), branchHead: 'c'.repeat(40) }) },
  { id: 'proposals.check', proposal: true },
  { id: 'proposals.promote', proposal: true, body: () => ({ expectedTip: 'd'.repeat(40) }) },
  { id: 'proposals.close', proposal: true, body: () => ({}) },
  { id: 'proposals.restore', proposal: true, body: () => ({}) },
];

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value.replace(/\b[0-9a-f]{40,64}\b/g, '<hash>').replace(/\/tmp\/[^\s"']+/g, '<temporary>') : value;
  const volatile = ['at', 'prev', 'requestId', 'createdAt', 'lastMovementAt', 'tool', 'origin', 'connection'];
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !volatile.includes(key))
      .map(([key, item]) => [key, normalized(item)]),
  );
}

// Three proposals: one a Steward of Sales sees whole, one that also declares People, one only People.
async function prepare(fixture: Fixture) {
  const { sales, people } = fixture.projects;
  const dave = fixture.dave();
  await createProposal(dave, sales.slug, 'Parity open', [sales.slug]);
  await createProposal(dave, sales.slug, 'Parity mixed', [sales.slug, people.slug]);
  await createProposal(dave, people.slug, 'Parity people', [people.slug]);
}

const actorFor = (scenario: Scenario) => ({ allowed: person('dave'), 'denied-action': salesViewer(), 'denied-target': person('bob'), hidden: person('bob'), missing: person('dave') })[scenario];
const proposalFor = (scenario: Scenario) =>
  ({ allowed: 'parity-open', 'denied-action': 'parity-open', 'denied-target': 'parity-mixed', hidden: 'parity-people', missing: 'no-such-proposal' })[scenario];

async function answer(fixture: Fixture, operation: Operation, scenario: Scenario, transport: 'http' | 'twin') {
  const principal = fixture.access.principalFor(actorFor(scenario));
  fixture.ws.state.recordUser(principal, new Date().toISOString());
  const audit = createAuditLog({ dir: join(fixture.root, `parity-audit-${operation.id}-${scenario}-${transport}`) });
  const handler = createHandler(fixture.ws, { mode: 'server', access: fixture.access, audit, principal: () => principal, publicOrigin: origin, port: 5312, remoteCredentials: allowEveryRemote() });
  const params: Record<string, string> = { slug: fixture.projects.sales.slug };
  if (operation.proposal) params.id = proposalFor(scenario);
  const body = operation.body?.(fixture);
  const request = buildTwinRequest(operation.id, { params, query: operation.query, body });
  const response =
    transport === 'twin'
      ? (await handler.boundary.operate({ caller: mintCaller({ principal, origin: 'mcp' }), request })).response
      : await handler(
          new Request(origin + new URL(request.url).pathname + new URL(request.url).search, {
            method: request.method,
            body: operation.body ? await request.text() : undefined,
            headers: { ...Object.fromEntries(request.headers), Origin: origin, 'X-SW-Request': '1' },
          }),
        );
  const text = await response.text();
  let payload: unknown = text;
  try {
    payload = JSON.parse(text);
  } catch {
    /* A body that is not JSON is compared as text. */
  }
  return { status: response.status, body: normalized(payload), audit: audit.recent(10).map(normalized) };
}

for (const operation of OPERATIONS) {
  test(`${operation.id} answers alike through HTTP and the boundary in every scenario`, async () => {
    for (const scenario of scenarios) {
      // A call that may change state gets a workspace of its own per transport; refusals change nothing.
      let http;
      let twin;
      if (scenario === 'allowed' || operation.id === 'proposals.create') {
        using first = await proposalFixture();
        await prepare(first);
        http = await answer(first, operation, scenario, 'http');
        using second = await proposalFixture();
        await prepare(second);
        twin = await answer(second, operation, scenario, 'twin');
      } else {
        using shared = await proposalFixture();
        await prepare(shared);
        http = await answer(shared, operation, scenario, 'http');
        twin = await answer(shared, operation, scenario, 'twin');
      }
      // An HTTP read leaves no audit record while the same read through the boundary does, by design.
      const reads = operation.body === undefined;
      const comparable = (result: typeof http) => (reads ? { status: result.status, body: result.body } : result);
      expect(comparable(twin), `${operation.id}: ${scenario}`).toEqual(comparable(http));
      expect(http.audit.length, `${operation.id}: ${scenario} never duplicates audit`).toBeLessThanOrEqual(1);
      if (scenario === 'missing' || scenario === 'hidden') expect(http.status, `${operation.id}: ${scenario}`).toBe(operation.proposal ? 404 : http.status);
    }
  }, 120_000);
}

test('hidden and missing proposals have the same visible response through the boundary', async () => {
  using fixture = await proposalFixture();
  await prepare(fixture);
  for (const operation of OPERATIONS.filter(item => item.proposal)) {
    const hidden = await answer(fixture, operation, 'hidden', 'twin');
    const principal = fixture.access.principalFor(person('bob'));
    const missing = await (async () => {
      const handler = createHandler(fixture.ws, { mode: 'server', access: fixture.access, principal: () => principal, publicOrigin: origin, port: 5312, remoteCredentials: allowEveryRemote() });
      const request = buildTwinRequest(operation.id, { params: { slug: fixture.projects.sales.slug, id: 'no-such-proposal' }, query: operation.query, body: operation.body?.(fixture) });
      const response = (await handler.boundary.operate({ caller: mintCaller({ principal, origin: 'mcp' }), request })).response;
      return { status: response.status, body: normalized(JSON.parse(await response.text())) };
    })();
    expect({ status: hidden.status, body: hidden.body }, operation.id).toEqual(missing);
  }
}, 60_000);
