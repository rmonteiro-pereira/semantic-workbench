// Tests compatibility of the document API over the folder store.
import { LOCAL_READER } from '../src/server/projects/reader';
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { editEntity, inspect } from '../src/shared/core/model';
import { testWorkspace } from './helpers/temp-data-dir';
const yaml = `# retain this comment\nname: Business\ncustom: preserved\nontology:\n  - concept: Customer\n    type: EntityType\n`;
test('edits preserve unknown fields and comments', () => {
  const out = editEntity(yaml, ['ontology', 0], 'Buyer');
  expect(out).toContain('# retain this comment');
  expect(out).toContain('custom: preserved');
  expect(inspect(out).entities[0].description).toBe('Buyer');
});
test('facade save indexes into the cache and rejects stale updates', async () => {
  const workspace = await testWorkspace();
  try {
    const saveDocument = await workspace.ws.saveDocument('a.yaml', yaml, LOCAL_READER);
    expect(saveDocument.id).toBe('ungrouped/a.yaml');
    expect(workspace.ws.cache.entities('ungrouped', 'a.yaml')).toHaveLength(1);
    await expect(
      workspace.ws.saveDocument('a.yaml', 'name: invalid', LOCAL_READER, saveDocument.id, {
        revision: saveDocument.revision,
      }),
    ).rejects.toThrow();
    expect(workspace.ws.documents()[0].source).toBe(yaml);
    await workspace.ws.saveDocument('a.yaml', editEntity(yaml, ['ontology', 0], 'Updated'), LOCAL_READER, saveDocument.id, {
      revision: saveDocument.revision,
    });
    await expect(
      workspace.ws.saveDocument('a.yaml', yaml, LOCAL_READER, saveDocument.id, {
        revision: saveDocument.revision,
      }),
    ).rejects.toThrow('changed');
    await expect(
      workspace.ws.saveDocument('a.yaml', yaml, LOCAL_READER, saveDocument.id, {
        baseHash: saveDocument.hash,
      }),
    ).rejects.toThrow('changed');
  } finally {
    workspace.dispose();
  }
});
test('rejects unresolved semantic joins', () => {
  expect(() => inspect('name: Sales\ndatasets: [{name: orders, source: db.orders}]\nrelationships: [{name: bad, from: orders, to: missing}]')).toThrow('unknown dataset');
});
test('folder store retains RDF/XML and SHACL sources byte for byte', async () => {
  const workspace = await testWorkspace();
  try {
    for (const filename of ['commerce.owl', 'commerce.shacl.ttl']) {
      const source = await Bun.file('public/examples/commerce/' + filename).text();
      await workspace.ws.saveDocument(filename, source, LOCAL_READER);
      expect(workspace.ws.documents().find(d => d.filename === filename)!.source).toBe(source);
      expect(readFileSync(`${workspace.root}/projects/ungrouped/${filename}`, 'utf8')).toBe(source);
    }
    expect(workspace.ws.cache.entities('ungrouped', 'commerce.owl').length).toBeGreaterThan(10);
  } finally {
    workspace.dispose();
  }
});
