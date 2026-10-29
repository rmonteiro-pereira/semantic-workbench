// Tests grouping suggestions and project moves through the API.
import { LOCAL_READER } from '../src/server/projects/reader';
import { test, expect } from 'bun:test';
import { testWorkspace } from './helpers/temp-data-dir';
test('grouping corrections persist in view state files without changing source or hash', async () => {
  const workspace = await testWorkspace();
  const handler = workspace.handler;
  try {
    const source = 'name: Sample\nontology: [{concept: A}]';
    const doc = await workspace.ws.saveDocument('sample.yaml', source, LOCAL_READER);
    const url = 'http://127.0.0.1:4310/api/documents/' + encodeURIComponent(doc.id) + '/grouping';
    expect(await (await handler(new Request(url))).json()).toEqual({});
    const grouping = {
      mode: 'suggested',
      assignments: { 'ontology/0': 'custom:Review' },
      names: { 'custom:Review': 'Review' },
    };
    expect((await handler(new Request(url, { method: 'PUT', body: JSON.stringify(grouping) }))).status).toBe(200);
    expect(await (await handler(new Request(url))).json()).toEqual(grouping);
    expect(workspace.ws.documents()[0].hash).toEqual(doc.hash);
    expect(workspace.ws.grouping(doc.id, LOCAL_READER)).toEqual(grouping);
    expect(workspace.ws.state.view('ungrouped').files['sample.yaml']).toEqual(grouping);
  } finally {
    workspace.dispose();
  }
});
test('grouping API rejects malformed modes and corrections and missing documents', async () => {
  const workspace = await testWorkspace();
  const handler = workspace.handler;
  try {
    const doc = await workspace.ws.saveDocument('sample.yaml', 'ontology: [{concept: A}]', LOCAL_READER);
    for (const invalidGrouping of [{ mode: 'inferred truth' }, { assignments: [] }, { names: { a: 5 } }, { assignments: { a: '' } }, { unknown: true }])
      expect((await handler(new Request('http://localhost/api/documents/' + encodeURIComponent(doc.id) + '/grouping', { method: 'PUT', body: JSON.stringify(invalidGrouping) }))).status).toBe(400);
    expect(
      (
        await handler(
          new Request('http://localhost/api/documents/missing/grouping', {
            method: 'PUT',
            body: '{}',
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handler(
          new Request('http://localhost/api/documents/ungrouped%2Fmissing.yaml/grouping', {
            method: 'PUT',
            body: '{}',
          }),
        )
      ).status,
    ).toBe(400);
    expect(workspace.ws.grouping(doc.id, LOCAL_READER)).toEqual({});
  } finally {
    workspace.dispose();
  }
});
