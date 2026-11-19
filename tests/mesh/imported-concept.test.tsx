/** Checks the visible provenance and editing affordances of imported graph nodes. */
import { expect, test } from 'bun:test';
import React, { type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider } from '@xyflow/react';
import type { Entity } from '../../src/shared/core/model';
import { EntityNode } from '../../src/app/graph/FullGraphNodes';
import { ImportedGraphKey } from '../../src/app/graph/GraphOptions';
import { entityCardData } from '../../src/app/graph/full-node-data';
import { EntityDetails } from '../../src/app/workspace/EntityDetails';

const version = '1234567890abcdef1234567890abcdef12345678';
const entity: Entity = {
  id: 'ontology/1',
  name: 'fin.Invoice',
  kind: 'EntityType',
  fields: [],
  path: ['ontology', 1],
  description: '',
  readOnlyForm: true,
  imported: { alias: 'fin', concept: 'Invoice', project: 'finance', ontology: 'finance.yaml', version },
};

test('the graph card gives imported provenance in text', () => {
  const props = { id: entity.name, data: { name: entity.name, ...entityCardData(entity, { width: 184, height: 68 }) } } as unknown as ComponentProps<typeof EntityNode>;
  const html = renderToStaticMarkup(
    <ReactFlowProvider>
      <EntityNode {...props} />
    </ReactFlowProvider>,
  );
  expect(html).toContain('Imported from finance');
  expect(html).toContain('1234567890ab');
  expect(renderToStaticMarkup(<ImportedGraphKey />)).toContain('owner and version');
  expect(entityCardData({ ...entity, imported: undefined }, { width: 184, height: 68 })).not.toHaveProperty('imported');
});

test('details identify the published version and do not offer an edit here', () => {
  const ignore = () => {};
  const unavailable = () => null;
  const html = renderToStaticMarkup(
    <EntityDetails
      entity={entity}
      showNeighborhood={ignore}
      rdfTarget={unavailable}
      setRdfEditing={ignore}
      setRdfDeleting={ignore}
      entityTarget={unavailable}
      setEditing={ignore}
      setAdding={ignore}
      setDeleting={ignore}
      setSource={ignore}
      source=""
      current={null}
      relatedDocuments={[]}
      openDocument={() => false}
      model={null}
      setSelectedEdge={ignore}
      setSelected={ignore}
      setDefinition={ignore}
    />,
  );
  expect(html).toContain('finance / finance.yaml');
  expect(html).toContain(version);
  expect(html).toContain('Edit this concept in its provider ontology.');
  expect(html).not.toContain('aria-label="Edit fin.Invoice"');
});
