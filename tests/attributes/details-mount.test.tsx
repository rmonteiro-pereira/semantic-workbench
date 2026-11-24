// Checks the three sections are mounted under the right items of the details panel and the catalog.
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'yaml';
import { ItemSectionSupportContext } from '../../src/app/edit/section-context';
import { CatalogView } from '../../src/app/workspace/CatalogView';
import { ItemSections } from '../../src/app/workspace/ItemSections';
import { inspect } from '../../src/shared/core/model';
import { ADDITIONS_PROJECT_FILES } from '../helpers/tessera-repository';

const ontologySource = ADDITIONS_PROJECT_FILES['retail/ontology.yaml'];
const modelSource = ADDITIONS_PROJECT_FILES['retail/semantic-model.yaml'];
const docs = [
  { id: 'p/retail/ontology.yaml', project: 'p', path: 'retail/ontology.yaml', filename: 'ontology.yaml', source: ontologySource, hash: 'a' },
  { id: 'p/retail/semantic-model.yaml', project: 'p', path: 'retail/semantic-model.yaml', filename: 'semantic-model.yaml', source: modelSource, hash: 'b' },
];
const support = {
  documentOf: (id: string) => parse(docs.find(doc => doc.id === id)!.source),
  projectDocsOf: () => docs,
  applySaved: () => {},
};
const noop = () => {};
const render = (target: Parameters<typeof ItemSections>[0]['target'], dirty = false) =>
  renderToStaticMarkup(
    <ItemSectionSupportContext.Provider value={support}>
      <ItemSections target={target} dirty={dirty} openConcept={noop} removeRelationship={noop} />
    </ItemSectionSupportContext.Provider>,
  );

test('a concept shows attributes, agent context and governance', () => {
  const html = render({ docId: docs[0].id, path: ['ontology', 2], kind: 'concept' });
  for (const heading of ['ATTRIBUTES', 'AGENT CONTEXT', 'GOVERNANCE']) expect(html).toContain(heading);
  expect(html).toContain('deprecated');
  expect(html).toContain('Use the account concept for new questions.');
});

test('a value type also lists the attributes that use it', () => {
  const html = render({ docId: docs[0].id, path: ['ontology', 0], kind: 'concept' });
  expect(html).toContain('ATTRIBUTES THAT USE THIS TYPE');
  expect(html).toContain('tier');
});

test('a relationship shows agent context and governance but no attribute list', () => {
  const html = render({ docId: docs[0].id, path: ['ontology', 2, 'relationships', 0], kind: 'ontology-relationship' });
  expect(html).toContain('AGENT CONTEXT');
  expect(html).toContain('GOVERNANCE');
  expect(html).not.toContain('ATTRIBUTES');
});

test('a metric shows its governance in the same section, read through the adapter', () => {
  const html = render({ docId: docs[1].id, path: ['metrics', 3], kind: 'metric' });
  expect(html).toContain('GOVERNANCE');
  expect(html).toContain('>deprecated<');
  expect(html).not.toContain('AGENT CONTEXT');
});

test('while the Source tab has unsaved changes the sections explain why they cannot change anything', () => {
  const html = render({ docId: docs[0].id, path: ['ontology', 2], kind: 'concept' }, true);
  expect(html).toContain('Save or discard the unsaved changes in the Source tab first.');
  expect(html).not.toContain('Save governance');
});

test('other kinds of item get no section', () => {
  expect(render({ docId: docs[1].id, path: ['datasets', 0], kind: 'dataset' })).toBe('');
});

test('catalog cards show the status and the attribute names of a concept', () => {
  const model = inspect(ontologySource, 'retail.ontology.yaml');
  const html = renderToStaticMarkup(
    <CatalogView
      model={model}
      search=""
      clearSearch={noop}
      area={null}
      clearArea={noop}
      selectEntity={noop}
      kpiBadges={new Map()}
      entityTarget={() => null}
      rdfTarget={() => null}
      setEditing={noop}
      setRdfEditing={noop}
    />,
  );
  expect(html).toContain('Attributes: tier, email');
  expect(html).toContain('>approved<');
  expect(html).toContain('>proposed<');
});
