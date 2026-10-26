// Tests grouping suggestions and persistence of dismissed suggestions.
import { test, expect } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { factsOf, inferSuggestions, evidenceBetween } from '../src/server/projects/suggestions';
import { testWorkspace, example } from './helpers/temp-data-dir';
import { createAccessControl } from '../src/server/auth/authorize';
import { accessFixture, person } from './auth/access-fixture';
import { LOCAL_READER } from '../src/server/projects/reader';
const api = (t: { handler: (r: Request) => Promise<Response> }, method: string, path: string) =>
  t.handler(new Request('http://127.0.0.1:4310' + path, { method }));
test('facts come from declared names, references, IRIs and physical names only', async () => {
  const mapping = factsOf(await example('ossie', 'flights.mapping.yaml'), 'flights.mapping.yaml');
  expect(mapping.refs.sort()).toEqual(['Flights', 'Flights semantic model']);
  expect(
    factsOf(await example('ossie', 'flights.ontology.yaml'), 'flights.ontology.yaml').names,
  ).toEqual(['Flights']);
  expect(
    factsOf(await example('commerce', 'commerce.odcs.yaml'), 'commerce.odcs.yaml').physical,
  ).toContain('analytics.commerce.orders');
  expect(
    factsOf(await example('commerce', 'sales.ossie.yaml'), 'sales.ossie.yaml').sources,
  ).toContain('analytics.commerce.orders');
  expect(
    factsOf(await example('commerce', 'commerce.owl.ttl'), 'commerce.owl.ttl').iris.length,
  ).toBeGreaterThan(5);
  expect(factsOf('not: [valid', 'x.yaml')).toEqual({
    names: [],
    refs: [],
    iris: [],
    physical: [],
    sources: [],
  });
});
test('evidence kinds: ossie-ref-name, shared-iri, odcs-physical-name; never similar names', () => {
  const f = (project: string, path: string, facts: Partial<ReturnType<typeof factsOf>>) => ({
    project,
    path,
    hash: path,
    facts: { names: [], refs: [], iris: [], physical: [], sources: [], ...facts },
  });
  const a = f('p', 'm.yaml', { refs: ['Flights'] });
  const b = f('q', 'o.yaml', { names: ['Flights'] });
  expect(evidenceBetween(a, b).map(e => e.kind)).toEqual(['ossie-ref-name']);
  expect(evidenceBetween(b, a).map(e => e.kind)).toEqual(['ossie-ref-name']);
  expect(evidenceBetween(f('p', 'x', { refs: ['Flight'] }), b)).toEqual([]);
  expect(evidenceBetween(f('p', 'x', { refs: ['flights'] }), b)).toEqual([]);
  expect(evidenceBetween(f('p', 'x', { names: ['Flights semantic'] }), b)).toEqual([]);
  expect(
    evidenceBetween(
      f('p', 'x', { iris: ['https://e/A'] }),
      f('q', 'y', { iris: ['https://e/A', 'https://e/B'] }),
    )[0].kind,
  ).toBe('shared-iri');
  expect(
    evidenceBetween(
      f('p', 'x', { physical: ['db.orders'] }),
      f('q', 'y', { sources: ['db.orders'] }),
    )[0].kind,
  ).toBe('odcs-physical-name');
  // The isolated q/o.yaml joins p, which already holds a related file; never the reverse.
  expect(
    inferSuggestions([a, b, f('p', 'sibling.yaml', { names: ['Flights'] })], new Set()),
  ).toEqual([
    {
      id: expect.any(String),
      file: { project: 'q', path: 'o.yaml', hash: 'o.yaml' },
      targetProject: 'p',
      evidence: expect.any(Array),
    },
  ]);
  expect(inferSuggestions([a, b], new Set(), ['q', 'p']).map(s => s.file.path)).toEqual(['m.yaml']);
  expect(inferSuggestions([a, b], new Set(['o.yaml:p']), ['p', 'q'])).toEqual([]);
});
test('a file imported alone is offered to the project it references; accept moves it, reject is remembered', async () => {
  const t = await testWorkspace();
  try {
    await t.ws.importBatch(
      {
        name: 'Flights',
        files: await Promise.all(
          ['flights.ontology.yaml', 'flights.semantic_model.yaml'].map(async path => ({
            path,
            source: await example('ossie', path),
          })),
        ),
      },
      LOCAL_READER,
    );
    await t.ws.importBatch(
      {
        files: [
          {
            path: 'tpcds_semantic_model.yaml',
            source: await Bun.file('tests/fixtures/ossie-mapping/tpcds_semantic_model.yaml').text(),
          },
        ],
      },
      LOCAL_READER,
    );
    expect(await (await api(t, 'GET', '/api/suggestions')).json()).toEqual([]);
    const mapping = await t.ws.importBatch(
      {
        files: [
          { path: 'flights.mapping.yaml', source: await example('ossie', 'flights.mapping.yaml') },
        ],
      },
      LOCAL_READER,
    );
    const list = await (await api(t, 'GET', '/api/suggestions')).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      file: { project: mapping.slug, path: 'flights.mapping.yaml' },
      targetProject: 'flights',
    });
    expect(list[0].evidence.map((e: any) => e.kind)).toEqual(['ossie-ref-name', 'ossie-ref-name']);
    expect(list[0].evidence[0].detail).toContain('"Flights"');
    const accepted = await (await api(t, 'POST', `/api/suggestions/${list[0].id}/accept`)).json();
    expect(accepted).toEqual({ project: 'flights', path: 'flights.mapping.yaml' });
    expect(existsSync(join(t.root, 'projects/flights/flights.mapping.yaml'))).toBe(true);
    expect(await (await api(t, 'GET', '/api/suggestions')).json()).toEqual([]);
    // Rejected: the same bytes are not offered to the same project again, even after a re-import.
    const again = await t.ws.importBatch(
      {
        name: 'Separate',
        files: [
          {
            path: 'flights.semantic_model.yaml',
            source: await example('ossie', 'flights.semantic_model.yaml'),
          },
        ],
      },
      LOCAL_READER,
    );
    const offer = (await (await api(t, 'GET', '/api/suggestions')).json()).find(
      (s: any) => s.file.project === again.slug,
    );
    expect(offer.targetProject).toBe('flights');
    expect((await api(t, 'POST', `/api/suggestions/${offer.id}/reject`)).status).toBe(200);
    expect(t.ws.state.suggestions().rejected).toMatchObject([
      { target: 'flights', project: again.slug, path: 'flights.semantic_model.yaml' },
    ]);
    await t.ws.trash.deleteProject(again.slug);
    await t.ws.importBatch(
      {
        name: 'Separate again',
        files: [
          {
            path: 'flights.semantic_model.yaml',
            source: await example('ossie', 'flights.semantic_model.yaml'),
          },
        ],
      },
      LOCAL_READER,
    );
    expect(await (await api(t, 'GET', '/api/suggestions')).json()).toEqual([]);
    expect((await api(t, 'POST', '/api/suggestions/0123456789abcdef0123/accept')).status).toBe(404);
  } finally {
    t.dispose();
  }
});

test('local mode announces the suggestion count only when it changes', async () => {
  using t = await testWorkspace();
  const source = 'name: Local\nontology: [{concept: A}]\n';
  await t.seed([{ path: 'a.yaml', source }], 'local');
  const counts = () =>
    t.ws.events
      .replay(0)!
      .filter(event => event.event === 'suggestions')
      .map(event => event.data);
  await Bun.sleep(120);
  expect(counts()).toEqual([{ open: 0 }]);
  const { hash } = t.ws.readFile('local', 'a.yaml');
  await t.ws.saveFile(
    'local',
    'a.yaml',
    { baseHash: hash, source: source + '# edited\n' },
    LOCAL_READER,
  );
  await Bun.sleep(120);
  expect(counts()).toEqual([{ open: 0 }]);
});

// Reads a stream until it carries a suggestion count, or gives up after two seconds.
async function untilSuggestionCount(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const stop = Date.now() + 2000;
  let text = '';
  while (!text.includes('event: suggestions') && Date.now() < stop) {
    const timeout = new Promise<{ done: true }>(resolve =>
      setTimeout(() => resolve({ done: true }), stop - Date.now()),
    );
    const chunk = await Promise.race([reader.read(), timeout]);
    if (chunk.done) break;
    text += decoder.decode(chunk.value);
  }
  await reader.cancel();
  return text;
}

test('each person hears their own suggestion count while local clients share one', async () => {
  using t = await testWorkspace();
  const access = createAccessControl(accessFixture());
  const scope = access.forRequest(access.principalFor(person('alice')));
  const request = () => new Request('http://localhost/api/events');
  const personal = t.ws.events.stream(request(), undefined, {
    scope,
    owner: scope.principal.id,
    suggestions: () => 5,
  });
  const local = t.ws.events.stream(request());
  await t.seed([{ path: 'a.yaml', source: 'name: Shared\nontology: [{concept: A}]\n' }], 'team');
  const [personalText, localText] = await Promise.all([
    untilSuggestionCount(personal),
    untilSuggestionCount(local),
  ]);
  expect(personalText).toContain('"open":5');
  expect(localText).toContain('event: suggestions\ndata: {"open":0}');
  const recorded = t.ws.events.replay(0)!.filter(event => event.event === 'suggestions');
  for (const event of recorded) expect(event.data).toHaveProperty('open');
});
