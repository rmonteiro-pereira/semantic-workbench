import { describe, expect, test } from 'bun:test';
import { candidateMappings, coveringMappings, dataContractFilenames, isDefinedIn, mappingsOfProject } from '../src/app/mappings/mapping-scope';
import { limitCovering, showMoreDatasetsLabel, visibleCount } from '../src/app/mappings/list-window';

const mappings = [
  { id: 'ubl.mapping', project: 'ubl' },
  { id: 'mall.mapping', project: 'mall' },
  { id: 'mall.ontology#ontology_mappings/0', project: 'mall' },
];

describe('which mappings the tab loads', () => {
  test('a mapping defined in the open file is the only one shown', () => {
    expect(candidateMappings(mappings, 'mall', 'mall.ontology').map(mapping => mapping.id)).toEqual(['mall.ontology#ontology_mappings/0']);
    expect(candidateMappings(mappings, 'mall', 'mall.mapping').map(mapping => mapping.id)).toEqual(['mall.mapping']);
  });

  test('another file offers every mapping of the open project and none of another project', () => {
    expect(candidateMappings(mappings, 'mall', 'mall.semantic').map(mapping => mapping.id)).toEqual(['mall.mapping', 'mall.ontology#ontology_mappings/0']);
    expect(candidateMappings(mappings, 'other', 'other.file')).toEqual([]);
  });

  test('no project open means no mapping', () => {
    expect(mappingsOfProject(mappings, undefined)).toEqual([]);
    expect(candidateMappings([], undefined, undefined)).toEqual([]);
  });

  test('a mapping belongs to the file that defines it, embedded or not', () => {
    expect(isDefinedIn({ id: 'mall.ontology#ontology_mappings/0' }, 'mall.ontology')).toBe(true);
    expect(isDefinedIn({ id: 'mall.mapping' }, 'mall.ontology')).toBe(false);
    expect(isDefinedIn({ id: 'mall.mapping' }, undefined)).toBe(false);
  });
});

describe('which loaded mappings cover the open file', () => {
  const loaded = [
    { option: { id: 'a.mapping' }, documents: [{ documentId: 'a.mapping' }, { documentId: 'a.ontology' }, { documentId: 'a.semantic' }] },
    { option: { id: 'b.mapping' }, documents: [{ documentId: 'b.mapping' }, { documentId: 'b.ontology' }, { documentId: 'b.semantic' }] },
  ];

  test('keeps the mapping that reads the file as its ontology or semantic model', () => {
    expect(coveringMappings(loaded, 'a.ontology').map(entry => entry.option.id)).toEqual(['a.mapping']);
    expect(coveringMappings(loaded, 'b.semantic').map(entry => entry.option.id)).toEqual(['b.mapping']);
  });

  test('keeps the mapping that is the open file and shows two when both read the file', () => {
    expect(coveringMappings(loaded, 'b.mapping').map(entry => entry.option.id)).toEqual(['b.mapping']);
    const shared = loaded.map(entry => ({ ...entry, documents: [...entry.documents, { documentId: 'shared.ontology' }] }));
    expect(coveringMappings(shared, 'shared.ontology')).toHaveLength(2);
  });

  test('keeps none for a file no mapping reads', () => {
    expect(coveringMappings(loaded, 'c.odcs')).toEqual([]);
  });
});

test('the data contract files of a project are found by their kind, not their name', () => {
  const file = (filename: string, source: string) => ({ id: filename, project: 'shop', path: filename, filename, source, hash: filename + source.length });
  const files = [
    file('shop.odcs.yaml', 'apiVersion: v3.0.2\nkind: DataContract\n'),
    file('model.yaml', 'name: model\ndatasets: []\n'),
    file('other.yaml', "kind: 'DataContract'\n"),
    file('notes.yaml', 'description: "kind: DataContract is a phrase"\n'),
  ];
  expect(dataContractFilenames(files)).toEqual(['shop.odcs.yaml', 'other.yaml']);
});

describe('list window', () => {
  test('never shows more than the list holds', () => {
    expect(visibleCount(10, 4)).toBe(4);
    expect(visibleCount(5, 40)).toBe(5);
  });

  test('widens the limit to cover a selected item past it', () => {
    expect(limitCovering(5, 12)).toBe(13);
    expect(limitCovering(5, 2)).toBe(5);
    expect(limitCovering(5, -1)).toBe(5);
  });

  test('names the next step of hidden datasets, or what remains when less than a step is hidden', () => {
    expect(showMoreDatasetsLabel(40)).toBe('Show 10 more datasets');
    expect(showMoreDatasetsLabel(4)).toBe('Show 4 more datasets');
  });
});
