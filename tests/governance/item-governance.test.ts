// Checks the one governance view over ontology items and metrics, including that viewing a metric changes nothing.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { governanceOf, isApproved, metricAttributesFromEdit, metricGovernanceOf, statusLabel, withGovernance } from '../../src/shared/governance/item-governance';

const GOVERNANCE_KEY = 'tessera_governance';

test('an ontology item reads its status, people and deprecation details', () => {
  const item = { concept: 'Order', [GOVERNANCE_KEY]: { status: 'deprecated', owner: 'Dana', steward: 'Eli', classification: 'internal', replaced_by: 'Purchase', deprecation_reason: 'Merged.' } };
  expect(governanceOf(item)).toEqual({
    source: 'ontology-item',
    status: 'deprecated',
    owner: 'Dana',
    steward: 'Eli',
    classification: 'internal',
    replacedBy: 'Purchase',
    deprecationReason: 'Merged.',
    secondEntryIgnored: false,
  });
});

test('an item without governance reads as not set and is not approved', () => {
  const governance = governanceOf({ concept: 'Order' });
  expect(governance.status).toBeUndefined();
  expect(isApproved(governance)).toBe(false);
  expect(statusLabel(governance.status)).toBe('not set');
});

test('the three label cases outside the vocabulary and the vocabulary itself', () => {
  expect(statusLabel('draft')).toBe('draft (older value)');
  expect(statusLabel('banana')).toBe('unknown value');
  expect(statusLabel('approved')).toBe('approved');
  expect(isApproved({ ...governanceOf({}), status: 'draft' })).toBe(false);
});

test('changing governance keeps other keys, removes emptied fields and drops an empty entry', () => {
  const item = { concept: 'Order', [GOVERNANCE_KEY]: { status: 'proposed', owner: 'Dana' } };
  expect((withGovernance(item, { status: 'approved' }) as any)[GOVERNANCE_KEY]).toEqual({ status: 'approved', owner: 'Dana' });
  expect((withGovernance(item, { owner: '' }) as any)[GOVERNANCE_KEY]).toEqual({ status: 'proposed' });
  expect(GOVERNANCE_KEY in withGovernance(item, { status: '', owner: '' })).toBe(false);
});

const metricWith = (...entries: object[]) => ({ name: 'revenue', custom_extensions: entries.map(data => ({ vendor_name: 'SEMANTIC_WORKBENCH', data: JSON.stringify(data) })) });

test('a metric is read from its first workbench entry and a second one is reported as ignored', () => {
  const metric = metricWith(
    { schema: 'semantic-workbench/metric/v1', type: 'simple', status: 'approved', owner: 'Dana' },
    { schema: 'semantic-workbench/metric/v1', type: 'simple', status: 'proposed' },
  );
  const governance = metricGovernanceOf(metric);
  expect(governance.source).toBe('metric');
  expect(governance.status).toBe('approved');
  expect(governance.owner).toBe('Dana');
  expect(governance.secondEntryIgnored).toBe(true);
  expect(metricGovernanceOf(metricWith({ status: 'proposed' })).secondEntryIgnored).toBe(false);
});

test('a legacy draft metric is shown as an older value and is not approved', () => {
  const governance = metricGovernanceOf(metricWith({ status: 'draft' }));
  expect(statusLabel(governance.status)).toBe('draft (older value)');
  expect(isApproved(governance)).toBe(false);
});

test('reading a metric leaves the file bytes unchanged', () => {
  const source = readFileSync('tests/fixtures/tessera/additions/project/semantic-model.yaml', 'utf8');
  const before = source;
  const model = parse(source);
  for (const metric of model.metrics ?? []) metricGovernanceOf(metric);
  expect(source).toBe(before);
});

test('an edit becomes metric attributes under the stored names and has no classification', () => {
  expect(metricAttributesFromEdit({ status: 'deprecated', replacedBy: 'revenue2', classification: 'internal' })).toEqual({ status: 'deprecated', replaced_by: 'revenue2' });
  expect(metricAttributesFromEdit({ owner: '' })).toEqual({ owner: undefined });
});
