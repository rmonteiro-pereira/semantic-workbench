// Verifies fixture bytes independently of the comparison implementation.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { changedOntology, itemDiffRepository, type RepositoryChange } from '../helpers/item-diff-repository';

test('committed project has an ontology, a model and two attributes', async () => {
  const repository = await itemDiffRepository();
  try {
    expect(repository.commit).toMatch(/^[a-f0-9]{40}$/);
    const ontology = parse(await repository.git('show', 'HEAD:finance.ontology.yaml'));
    expect(ontology.ontology[0].relationships.map((entry: { name: string }) => entry.name)).toEqual(['email', 'tier', 'purchases']);
    expect(parse(await repository.git('show', 'HEAD:finance.semantic.yaml')).datasets[0].fields[0].name).toBe('amount');
    expect(await repository.git('status', '--porcelain')).toBe('');
  } finally {
    repository.cleanup();
  }
});

test('saved second states preserve each intended byte change and explicit migration', async () => {
  const repository = await itemDiffRepository();
  const changes: RepositoryChange[] = ['added', 'recorded-rename', 'outside-rename', 'attribute', 'removed', 'comment', 'reorder', 'crlf', 'unparsable', 'ambiguous'];
  try {
    for (const change of changes) {
      const migrations = repository.secondState(change);
      expect(readFileSync(join(repository.root, 'finance.ontology.yaml'), 'utf8')).toBe(changedOntology(change));
      expect(migrations.length).toBe(change === 'recorded-rename' ? 1 : 0);
      if (migrations.length) expect(migrations[0]).toMatchObject({ from: expect.stringContaining('relationship:purchases'), to: expect.stringContaining('relationship:buys') });
    }
    expect(parse(changedOntology('added')).ontology.at(-1).concept).toBe('Invoice');
    expect(parse(changedOntology('outside-rename')).ontology.at(-1).concept).toBe('Former');
    expect(parse(changedOntology('attribute')).ontology[0].relationships[1].roles[0].concept).toBe('String');
    expect(parse(changedOntology('removed')).ontology.map((entry: { concept: string }) => entry.concept)).not.toContain('Retired');
    const original = parse(await repository.git('show', 'HEAD:finance.ontology.yaml'));
    for (const change of ['comment', 'reorder', 'crlf'] as const) expect(parse(changedOntology(change))).toEqual(original);
    expect(() => parse(changedOntology('unparsable'))).toThrow();
    expect(parse(changedOntology('ambiguous')).ontology.filter((entry: { concept: string }) => entry.concept === 'Order')).toHaveLength(2);
  } finally {
    repository.cleanup();
  }
});
