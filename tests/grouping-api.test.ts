// Tests grouping suggestions and project moves through the API.
import { LOCAL_READER } from '../src/server/projects/reader';
import { test, expect } from 'bun:test';
import { testWorkspace } from './helpers/temp-data-dir';
test('grouping corrections persist in view state files without changing source or hash', async () => {
  const t = await testWorkspace();
  const h = t.handler;
  try {
    const source = 'name: Sample\nontology: [{concept: A}]';
    const doc = await t.ws.saveDocument('sample.yaml', source, LOCAL_READER);
    const url = 'http://127.0.0.1:4310/api/documents/' + encodeURIComponent(doc.id) + '/grouping';
    expect(await (await h(new Request(url))).json()).toEqual({});
    const value = {
      mode: 'suggested',
      assignments: { 'ontology/0': 'custom:Review' },
      names: { 'custom:Review': 'Review' },
    };
    expect((await h(new Request(url, { method: 'PUT', body: JSON.stringify(value) }))).status).toBe(
      200,
    );
    expect(await (await h(new Request(url))).json()).toEqual(value);
    expect(t.ws.documents()[0].hash).toEqual(doc.hash);
    expect(t.ws.grouping(doc.id, LOCAL_READER)).toEqual(value);
    expect(t.ws.state.view('ungrouped').files['sample.yaml']).toEqual(value);
  } finally {
    t.dispose();
  }
});
test('grouping API rejects malformed modes and corrections and missing documents', async () => {
  const t = await testWorkspace();
  const h = t.handler;
  try {
    const doc = await t.ws.saveDocument('sample.yaml', 'ontology: [{concept: A}]', LOCAL_READER);
    for (const value of [
      { mode: 'inferred truth' },
      { assignments: [] },
      { names: { a: 5 } },
      { assignments: { a: '' } },
      { unknown: true },
    ])
      expect(
        (
          await h(
            new Request(
              'http://localhost/api/documents/' + encodeURIComponent(doc.id) + '/grouping',
              { method: 'PUT', body: JSON.stringify(value) },
            ),
          )
        ).status,
      ).toBe(400);
    expect(
      (
        await h(
          new Request('http://localhost/api/documents/missing/grouping', {
            method: 'PUT',
            body: '{}',
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await h(
          new Request('http://localhost/api/documents/ungrouped%2Fmissing.yaml/grouping', {
            method: 'PUT',
            body: '{}',
          }),
        )
      ).status,
    ).toBe(400);
    expect(t.ws.grouping(doc.id, LOCAL_READER)).toEqual({});
  } finally {
    t.dispose();
  }
});
