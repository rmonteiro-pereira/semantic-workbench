// Tests references and drafts affected by deletion.
import { LOCAL_READER } from '../src/server/projects/reader';
import { test, expect } from 'bun:test';
import { testWorkspace, example } from './helpers/temp-data-dir';
const flights = async () => Promise.all(['flights.ontology.yaml', 'flights.semantic_model.yaml', 'flights.mapping.yaml'].map(async path => ({ path, source: await example('ossie', path) })));
test('delete impact lists removed items, unsaved drafts and references that break', async () => {
  const t = await testWorkspace();
  try {
    const { slug } = await t.ws.importBatch({ name: 'Flights', files: await flights() }, LOCAL_READER);
    t.ws.state.writeDraft(slug, 'flights.ontology.yaml', {
      baseHash: null,
      text: 'draft',
      patches: [],
    });
    const r = await t.handler(new Request(`http://127.0.0.1:4310/api/projects/${slug}/delete-impact?path=flights.ontology.yaml`));
    expect(r.status).toBe(200);
    const impact = await r.json();
    expect(impact.removes).toEqual({ project: slug, files: ['flights.ontology.yaml'] });
    expect(impact.unsavedDrafts).toEqual([{ project: slug, path: 'flights.ontology.yaml' }]);
    expect(impact.brokenReferences).toEqual([
      {
        from: { project: slug, path: 'flights.mapping.yaml' },
        to: { project: slug, path: 'flights.ontology.yaml' },
        kind: 'ossie-ref-name',
        name: 'Flights',
      },
    ]);
    const whole = t.ws.deleteImpact(slug, undefined, LOCAL_READER);
    expect(whole.removes).toEqual({
      project: slug,
      name: 'Flights',
      files: ['flights.mapping.yaml', 'flights.ontology.yaml', 'flights.semantic_model.yaml'],
    });
    expect(whole.brokenReferences).toEqual([]);
    expect(t.ws.deleteImpact(slug, 'flights.semantic_model.yaml', LOCAL_READER).brokenReferences.map(b => b.name)).toEqual(['Flights semantic model']);
    // A copy of the ontology in another project does not keep the reference resolvable.
    await t.ws.importBatch(
      {
        name: 'Copy',
        files: [
          {
            path: 'flights.ontology.yaml',
            source: await example('ossie', 'flights.ontology.yaml'),
          },
        ],
      },
      LOCAL_READER,
    );
    expect(t.ws.deleteImpact(slug, 'flights.ontology.yaml', LOCAL_READER).brokenReferences.map(b => b.name)).toEqual(['Flights']);
    expect((await t.handler(new Request(`http://127.0.0.1:4310/api/projects/${slug}/delete-impact?path=missing.yaml`))).status).toBe(404);
  } finally {
    t.dispose();
  }
});
