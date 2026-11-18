import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadItemComparison, overlayEnabled, useItemDiff } from '../../src/app/item-diff/use-item-diff';
import type { Doc, ProjectInfo } from '../../src/app/projects/api';
import type { ItemDiff } from '../../src/shared/item-diff/item-change';

const project: ProjectInfo = {
  slug: 'sales',
  name: 'Sales',
  origin: '',
  repo: 'sales',
  folder: '',
  branch: 'feature',
  ahead: 0,
  behind: 0,
  changes: 1,
  files: [],
  published: { branch: 'main', commit: 'published' },
};
const baseline: ItemDiff = {
  from: { side: 'published', version: 'published' },
  to: { side: 'working', version: 'working' },
  counts: { added: 0, changed: 0, removed: 0 },
  changes: [],
  notCompared: [],
  omitted: 0,
};

test('the saved status defaults the overlay and a choice overrides it', () => {
  expect(overlayEnabled(undefined, project)).toBe(true);
  expect(overlayEnabled(undefined, { ...project, changes: 0 })).toBe(false);
  expect(overlayEnabled(undefined, { ...project, published: null })).toBe(false);
  expect(overlayEnabled(false, project)).toBe(false);
  expect(overlayEnabled(true, { ...project, published: null })).toBe(true);
});

test('an off comparison stays idle, and an enabled one reports empty, partial and error results', async () => {
  const signal = new AbortController().signal;
  let requests = 0;
  const request = async () => {
    requests++;
    return baseline;
  };
  expect(await loadItemComparison(false, project, [], signal, request)).toEqual({ state: 'off' });
  expect(requests).toBe(0);
  expect(await loadItemComparison(true, project, [], signal, request)).toEqual({ state: 'empty', diff: baseline });
  expect(requests).toBe(1);
  const partial = { ...baseline, omitted: 1 };
  expect(await loadItemComparison(true, project, [], signal, async () => partial)).toEqual({ state: 'partial', diff: partial });
  const fail = async () => {
    throw new Error('Comparison unavailable.');
  };
  expect(await loadItemComparison(true, project, [], signal, fail)).toEqual({ state: 'error', message: 'Comparison unavailable.' });
});

test('an explicitly enabled unpublished project marks its saved items without asking for a missing published side', async () => {
  const path = 'sales.ontology.yaml';
  const doc: Doc = { id: 'sales/' + path, project: 'sales', filename: path, path, hash: 'saved', source: 'name: Sales\nontology: [{concept: Customer}]' };
  const signal = new AbortController().signal;
  const request = async () => {
    throw new Error('An unpublished project has no published side.');
  };
  const result = await loadItemComparison(true, { ...project, published: null }, [doc], signal, request);
  expect(result).toMatchObject({
    state: 'ready',
    diff: {
      changes: [
        { state: 'added', kind: 'ontology' },
        { state: 'added', kind: 'concept', name: 'Customer' },
      ],
    },
  });
});

test('an enabled overlay renders a loading state before the first comparison', () => {
  function Status() {
    const comparison = useItemDiff(project, [], 0);
    return <span>{comparison.result.state}</span>;
  }
  expect(renderToStaticMarkup(<Status />)).toBe('<span>loading</span>');
});
