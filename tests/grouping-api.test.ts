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

test('legacy example grouping reads as Auto and saves canonically without losing corrections', async () => {
  const workspace = await testWorkspace();
  try {
    const doc = await workspace.ws.saveDocument('sample.yaml', 'ontology: [{concept: Order}, {concept: Party}]', LOCAL_READER);
    const legacy = { mode: 'example', assignments: { 'ontology/0': 'documents' }, names: { documents: 'Reviewed documents', parties: 'Trading parties' } };
    await workspace.ws.saveGrouping(doc.id, legacy, LOCAL_READER);
    const url = 'http://localhost/api/documents/' + encodeURIComponent(doc.id) + '/grouping';
    const migrated = { ...legacy, mode: 'auto' };
    expect(await (await workspace.handler(new Request(url))).json()).toEqual(migrated);
    expect(workspace.ws.state.view('ungrouped').files['sample.yaml']).toEqual(legacy);
    const response = await workspace.handler(new Request(url, { method: 'PUT', body: JSON.stringify(legacy) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(migrated);
    expect(workspace.ws.state.view('ungrouped').files['sample.yaml']).toEqual(migrated);
    expect(workspace.ws.documents()[0].hash).toBe(doc.hash);
    expect((await workspace.handler(new Request(url, { method: 'PUT', body: JSON.stringify({ ...legacy, names: { documents: 5 } }) }))).status).toBe(400);
    expect(await (await workspace.handler(new Request(url))).json()).toEqual(migrated);
  } finally {
    workspace.dispose();
  }
});
