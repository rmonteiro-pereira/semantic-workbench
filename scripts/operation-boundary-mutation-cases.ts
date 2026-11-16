// Exercises candidate boundary modules through their composed entry points.
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { authWorkspace } from '../tests/helpers/auth-workspace';
import { accessFixture, person } from '../tests/auth/access-fixture';
import { replayEntry } from '../tests/auth/replay-fixture';
import { hiddenResponses } from '../src/server/request';
import { LOCAL_READER } from '../src/server/projects/reader';
import type { Caller } from '../src/server/auth/caller';
import type { OperationCall } from '../src/server/auth/operation-boundary';

async function setup(target: string, fixture: Awaited<ReturnType<typeof authWorkspace>>, options = accessFixture()) {
  const folder = dirname(target);
  const { createAccessMiddleware } = await import(join(folder, 'middleware.ts'));
  const { createAccessControl } = await import(join(folder, 'authorize.ts'));
  const { mintCaller } = await import(join(folder, 'caller.ts'));
  const { createAuditLog } = await import(join(folder, 'audit.ts'));
  const { WriteAccessError } = await import(join(folder, 'write-access-error.ts'));
  const { buildTwinRequest } = await import(join(folder, 'twin-request.ts'));
  const { sampleReplayEntries } = await import(join(folder, 'replay-sample.ts'));
  const access = createAccessControl(options);
  const audit = createAuditLog({ dir: join(fixture.root, 'operation-mutations') });
  const state = { response: Response.json({ ran: true }), error: undefined as Error | undefined };
  const handler = createAccessMiddleware(
    fixture.ws,
    { mode: 'server', access, audit },
    () => null,
    async () => {
      if (state.error) throw state.error;
      return state.response;
    },
  );
  const caller = (name: 'alice' | 'bob' | 'dave' | 'erin') => mintCaller({ principal: access.principalFor(person(name)), origin: 'mcp' });
  const invoke = async (identity: Caller, path: string, method = 'GET', operation?: string) =>
    (await handler.boundary.operate({ caller: identity, request: new Request('http://operation.internal' + path, { method }), operation } satisfies OperationCall)).response;
  return { folder, fixture, audit, caller, invoke, state, mintCaller, access, boundary: handler.boundary, WriteAccessError, buildTwinRequest, sampleReplayEntries };
}

type Context = Awaited<ReturnType<typeof setup>>;

async function dispatchCases(context: Context) {
  const { caller, invoke, mintCaller, access } = context;
  const { clientPrincipal } = await import(join(context.folder, 'principal.ts'));
  assert.deepEqual(await (await invoke(caller('erin'), '/api/projects')).json(), { error: 'no access' }, 'no-grant refusal');
  assert.equal((await invoke(caller('bob'), '/api/audit')).status, 200, 'Steward audit scope');
  assert.equal((await invoke(caller('dave'), '/api/projects/sales-contracts/git/identity', 'PUT')).status, 404, 'local-only identity');
  assert.equal((await invoke(caller('alice'), '/api/documents', 'POST')).status, 200, 'body-target route pass');
  assert.equal((await invoke(mintCaller({ principal: clientPrincipal('sw-agent'), origin: 'mcp' }), '/api/agent/projects')).status, 200, 'client action substitution');
  await assert.rejects(invoke({ ...caller('dave') }, '/api/projects'), /not minted/, 'caller provenance');
  assert.equal((await invoke(caller('dave'), '/api/projects', 'GET', 'files.read')).status, 404, 'named row match');
  const scoped = mintCaller({ principal: access.principalFor(person('dave')), origin: 'mcp', scope: ['read'] });
  assert.equal((await invoke(scoped, '/api/projects', 'POST')).status, 403, 'connection effect restriction');
}

async function responseCases({ fixture, audit, caller, invoke, state, mintCaller, WriteAccessError }: Context) {
  const deleted = await fixture.ws.trash.deleteFile('hr-people', 'people.odcs.yaml', undefined, LOCAL_READER);
  assert.equal((await invoke(caller('alice'), '/api/trash/' + deleted.entryId + '/restore', 'POST')).status, 404, 'trash target resolution');
  const scoped = mintCaller({ ...caller('alice'), scope: ['read'] });
  const beforeScoped = audit.recent(100).length;
  assert.equal((await invoke(scoped, '/api/trash/' + deleted.entryId + '/restore', 'POST')).status, 404, 'scope preserves hidden denial');
  assert.equal((await invoke(scoped, '/api/trash/missing-entry/restore', 'POST')).status, 404, 'scope preserves missing response');
  assert.equal(audit.recent(100).length, beforeScoped + 1, 'scope preserves trash audit distinction');
  state.error = new WriteAccessError('edit', { type: 'project', project: 'sales-contracts' }, { allow: false, status: 403, rules: [], reason: 'test-target' });
  assert.equal((await invoke(caller('dave'), '/api/projects', 'POST')).status, 403, 'handler refusal conversion');
  state.error = undefined;
  state.response = new Response('private target', { status: 404 });
  assert.equal(await (await invoke(caller('dave'), '/api/projects')).text(), JSON.stringify({ error: 'Not found.' }), '404 normalization');
  hiddenResponses.add(state.response);
  const previous = audit.recent(100).length;
  await invoke(caller('dave'), '/api/projects');
  assert.equal(audit.recent(100).length, previous + 1, 'hidden response audit count');
  assert.equal(audit.recent(100).at(-1)?.decision, 'deny', 'hidden response denial');
  state.response = Response.json({ ran: true });
  await invoke(caller('dave'), '/api/projects');
  assert.equal(audit.recent(100).at(-1)?.tool, 'projects.list', 'tool serialization');
}

function builderAndReplayCases({ buildTwinRequest, sampleReplayEntries }: Context) {
  const twin = buildTwinRequest('files.read', { params: { slug: 'sales?secret', '*': 'x#fragment.yaml' } });
  assert(twin.url.includes('sales%3Fsecret') && twin.url.includes('x%23fragment.yaml'), 'path encoding');
  const ordinary = Array.from({ length: 900 }, (_, index) => replayEntry(index));
  const reads = Array.from({ length: 1000 }, (_, index) => replayEntry(index + 900, 'mcp'));
  const sampled = sampleReplayEntries([...ordinary, ...reads]);
  assert.equal(sampled.filter((entry: { origin?: string }) => !entry.origin).length, 900, 'read flood preserves ordinary stratum');
  assert.equal(sampled.filter((entry: { origin?: string }) => entry.origin === 'mcp').length, 500, 'read stratum bound');
}

async function listingCases(target: string, fixture: Awaited<ReturnType<typeof authWorkspace>>) {
  for (const administratorRule of [false, true]) {
    const options = accessFixture();
    const project = { domain: 'sales', everyoneCanRead: true, stewards: [], restricted: [], protectedBranches: [] };
    options.config.projects.projects['sales-metrics'] = project;
    options.config.projects.projects['sales-contracts'] = structuredClone(project);
    const grant = options.config.grants.find(grant => grant.id === 'g-sales-editors')!;
    if (administratorRule) {
      options.config.adminRules = {
        'last-project': 'forbid (principal, action == SW::Action::"edit", resource) unless { resource.project == "sales-contracts" };',
      };
    } else {
      grant.scope = { kind: 'projects', projects: ['sales-contracts'] };
    }
    const context = await setup(target, fixture, options);
    assert(context.boundary.availableOperations(context.caller('alice')).includes('files.save'), 'listing preserves distinct policy scopes');
  }
}

/** Runs named behavioral assertions against a copied boundary and its sibling modules. */
export async function operationBoundaryCases(target: string): Promise<void> {
  using fixture = await authWorkspace();
  const context = await setup(target, fixture);
  await dispatchCases(context);
  await responseCases(context);
  builderAndReplayCases(context);
  await listingCases(target, fixture);
}
