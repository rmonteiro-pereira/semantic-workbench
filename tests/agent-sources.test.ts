// Exercises production selection through the same HTTP routes for people and applications.
import { expect, test } from 'bun:test';
import { createHandler } from '../src/server/handler';
import { createAccessControl } from '../src/server/auth/authorize';
import { clientPrincipal } from '../src/server/auth/principal';
import { requestAccess, requestReader } from '../src/server/auth/request-scope';
import { LOCAL_READER } from '../src/server/projects/reader';
import { locationOf } from '../src/server/projects/paths';
import { accessFixture, person } from './auth/access-fixture';
import { authWorkspace } from './helpers/auth-workspace';
import { allowEveryRemote } from './helpers/remote-credentials-fixture';
import { testWorkspace } from './helpers/temp-data-dir';
import { publishFixture } from './helpers/published-workspace';

const origin = 'http://localhost:5173';
const mapping = 'commerce.mapping.yaml';
const files = [mapping, 'commerce.mapped-ontology.yaml', 'commerce.mapped-semantic.yaml'];
function request(project: string, operation: string, application = false) {
  const headers = { Origin: origin, 'X-SW-Request': '1', ...(application ? { Authorization: 'Bearer fixture' } : { Cookie: 'session=fixture' }) };
  if (operation === 'plan') {
    return new Request(origin + '/api/agent/plan', {
      method: 'POST',
      headers,
      body: JSON.stringify({ project, mappingId: `${project}/${mapping}`, metrics: ['gross_revenue'], dimensions: [] }),
    });
  }
  return new Request(`${origin}/api/agent/${operation}?project=${project}&mappingId=${project}/${mapping}`, { headers });
}

for (const mode of ['local', 'server'] as const) {
  test(`${mode} people and applications plan from the same published bytes despite authoring edits`, async () => {
    using fixture = mode === 'server' ? await authWorkspace() : await testWorkspace();
    const project = mode === 'server' ? 'sales-contracts' : 'ungrouped';
    for (const file of files) {
      const source = await Bun.file(`public/examples/commerce/${file}`).text();
      if (mode === 'local') await fixture.ws.saveDocument(file, source, LOCAL_READER);
      else await fixture.ws.saveFile(project, file, { baseHash: null, source }, LOCAL_READER);
    }
    await publishFixture(fixture);
    const access = createAccessControl(accessFixture());
    const principal = access.principalFor(person('alice'));
    const handler =
      mode === 'local'
        ? fixture.handler
        : createHandler(fixture.ws, {
            mode,
            access,
            principal: () => principal,
            bearer: async () => clientPrincipal('sw-agent'),
            remoteCredentials: allowEveryRemote(),
            publicOrigin: origin,
          });
    const scoped = Object.assign(new Request(origin), { [requestAccess]: access.forRequest(principal) });
    const reader = mode === 'local' ? LOCAL_READER : requestReader(scoped);
    const before = fixture.ws.readFile(project, mapping, reader);
    await fixture.ws.saveFile(project, mapping, { baseHash: before.hash, source: before.source.replace('gross_revenue', 'unpublished_revenue') }, reader);
    await fixture.ws.saveFile(project, 'wip.mapping.yaml', { baseHash: null, source: before.source.replace('Commerce mapping', 'Unpublished mapping') }, reader);
    const repository = locationOf(fixture.ws.project(project)).repo;
    const commit = fixture.ws.published.pin().commits.get(repository)!.commit;
    for (const operation of ['catalog', 'context', 'plan']) {
      const personResponse = await handler(request(project, operation));
      const applicationResponse = await handler(request(project, operation, mode === 'server'));
      expect(personResponse.status).toBe(200);
      expect(applicationResponse.status).toBe(200);
      expect(personResponse.headers.get('X-Workbench-Snapshot')).toBe(commit);
      expect(applicationResponse.headers.get('X-Workbench-Snapshot')).toBe(commit);
      expect(await personResponse.text()).toBe(await applicationResponse.text());
    }
    const unknown = await handler(new Request(`${origin}/api/agent/context?project=${project}&mappingId=${project}/wip.mapping.yaml`));
    expect(unknown.status).toBe(400);
    expect(await unknown.text()).not.toContain('unpublished_revenue');
  });
}

for (const route of ['agent/catalog?project=', 'projects/']) {
  test(`${route} retains its pinned bytes and header when its project is removed before loading`, async () => {
    using fixture = await testWorkspace();
    const { slug } = await fixture.ws.loadExample('mapped-commerce');
    await fixture.ws.publish(slug, LOCAL_READER);
    const repository = locationOf(fixture.ws.project(slug)).repo;
    const commit = fixture.ws.published.pin().commits.get(repository)!.commit;
    const withPin = fixture.ws.published.withPin.bind(fixture.ws.published);
    fixture.ws.published.withPin = use =>
      withPin(pin => {
        fixture.ws.state.writeRegistry([]);
        return use(pin);
      });
    const path = route === 'projects/' ? `${route}${slug}/metrics` : route + slug;
    const response = await fixture.handler(new Request(`${origin}/api/${path}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Workbench-Snapshot')).toBe(commit);
    const result = await response.json();
    if (route === 'projects/') expect(JSON.stringify(result)).toContain('gross_revenue');
    else expect(result.mappings).toHaveLength(1);
    await expect(fixture.ws.published.readableDocuments(fixture.ws.published.pin(), slug, LOCAL_READER)).rejects.toMatchObject({ reason: 'unavailable' });
  });
}
