import { describe, expect, test } from 'bun:test';
import { mappingBlocker, mappingTargets, newFileName, newFileProblem, newFileSource, type NewFileKind } from '../src/shared/projects/new-file';
import { validateInput } from '../src/shared/validation/input';

const contractId = '6f0d2c1e-8a47-4f0b-9a52-3b7e5d9c4a10';

describe('new file templates', () => {
  const ontology = { name: 'Shop ontology', path: 'shop.ontology.yaml' };
  const semanticModel = { name: 'Shop model', path: 'models/shop.semantic.yaml' };
  const kinds: NewFileKind[] = ['ontology', 'semantic', 'mapping', 'odcs'];

  test.each(kinds)('a new %s file validates with no findings', kind => {
    const source = newFileSource(kind, {
      name: 'Shop: "core" #1',
      contractId,
      ontology,
      semanticModel,
    });
    const result = validateInput(source, newFileName(kind, 'Shop'));
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  test('each kind is recognised as its own kind of document', () => {
    const kindOf = (kind: NewFileKind) => validateInput(newFileSource(kind, { name: 'Shop', contractId, ontology, semanticModel }), 'x.yaml').model?.kind;
    expect(kindOf('ontology')).toBe('Ossie ontology');
    expect(kindOf('semantic')).toBe('Ossie semantic');
    expect(kindOf('mapping')).toBe('Ossie mappings');
  });

  test('a mapping points at the chosen files by name and relative path', () => {
    const source = newFileSource('mapping', { name: 'Shop mapping', ontology, semanticModel });
    expect(source).toContain('iri: ./shop.ontology.yaml');
    expect(source).toContain('iri: ./models/shop.semantic.yaml');
  });

  test('a mapping without both targets and a contract without an identifier are refused', () => {
    expect(() => newFileSource('mapping', { name: 'x', ontology })).toThrow('needs an ontology and a semantic model');
    expect(() => newFileSource('odcs', { name: 'x' })).toThrow('needs an identifier');
  });
});

describe('new file names', () => {
  test('files carry the suffix of their kind', () => {
    expect(newFileName('ontology', 'Sales Orders')).toBe('sales-orders.ontology.yaml');
    expect(newFileName('semantic', 'Sales Orders')).toBe('sales-orders.semantic.yaml');
    expect(newFileName('mapping', 'Sales Orders')).toBe('sales-orders.mapping.yaml');
    expect(newFileName('odcs', 'Sales Orders')).toBe('sales-orders.odcs.yaml');
  });

  test('a name without letters or digits gives no file name', () => {
    expect(newFileName('odcs', ' !!! ')).toBe('');
    expect(newFileProblem('odcs', ' !!! ', [])).toBe('The name needs at least one letter or digit.');
    expect(newFileProblem('odcs', '   ', [])).toBe('Enter a name.');
  });

  test('an existing file name is refused whatever its case, and another kind is free', () => {
    const existing = ['Shop.Ontology.yaml'];
    expect(newFileProblem('ontology', 'shop', existing)).toBe('shop.ontology.yaml already exists in this project. Choose another name.');
    expect(newFileProblem('semantic', 'shop', existing)).toBeNull();
    expect(newFileProblem('ontology', 'shop 2', existing)).toBeNull();
  });
});

describe('mapping targets', () => {
  const files = [
    { path: 'a.ontology.yaml', source: newFileSource('ontology', { name: 'A' }) },
    { path: 'b.semantic.yaml', source: newFileSource('semantic', { name: 'B' }) },
    { path: 'c.odcs.yaml', source: newFileSource('odcs', { name: 'C', contractId }) },
    { path: 'broken.yaml', source: 'name: [unclosed' },
  ];

  test('lists ontologies and semantic models by their declared names', () => {
    expect(mappingTargets(files)).toEqual({
      ontologies: [{ name: 'A', path: 'a.ontology.yaml' }],
      semanticModels: [{ name: 'B', path: 'b.semantic.yaml' }],
    });
  });

  test('says what is missing for a mapping', () => {
    expect(mappingBlocker(mappingTargets(files))).toBeNull();
    expect(mappingBlocker(mappingTargets([]))).toContain('an ontology and a semantic model');
    expect(mappingBlocker(mappingTargets(files.slice(0, 1)))).toContain('needs a semantic model');
    expect(mappingBlocker(mappingTargets(files.slice(1, 2)))).toContain('needs an ontology');
  });
});
