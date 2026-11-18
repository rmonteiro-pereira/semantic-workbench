// The guard rules for ontology items run as twins of the metric rules: the same person and the same kind of change give the same outcome.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createAccessControl } from '../../src/server/auth/authorize';
import { requestAccess, requestReader } from '../../src/server/auth/request-scope';
import { GuardedChangeError, guardedChanges, type ClassificationSettings, type FileChange } from '../../src/server/auth/guards';
import { ONTOLOGY_GUARDS_ACTIVE } from '../../src/shared/governance/ontology-guards';
import type { TestUserName } from '../helpers/auth-identities';
import { accessFixture, person } from '../auth/access-fixture';

const METRICS = readFileSync('tests/fixtures/auth-workspace/projects/sales-metrics/sales.semantic.yaml', 'utf8');
const SETTINGS: ClassificationSettings = { aliases: { sensitive: 'confidential' }, protectedLevel: 'confidential' };

/** An ontology with one concept in the given governance, written the way a person would. */
function ontology(governance: string, description = 'A customer order.', extra = ''): string {
  return `tessera: 2\nversion: 0.2.0.dev0\nname: Retail\nontology:\n  - concept: Order\n    type: EntityType\n    description: ${description}\n${governance}${extra}`;
}

const governed = (status: string, owner?: string) => `    tessera_governance:\n      status: ${status}\n${owner ? `      owner: ${owner}\n` : ''}`;

function personGuard(name: TestUserName) {
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person(name));
  const request = new Request('http://localhost/api');
  Object.assign(request, { [requestAccess]: access.forRequest(principal) });
  return requestReader(request).guard!;
}

function itemChange(after: string | null, before: string | null): FileChange {
  return { project: 'sales-metrics', path: 'retail.ontology.yaml', before, after };
}

function metricChange(after: string, before = METRICS): FileChange {
  return { project: 'sales-metrics', path: 'sales.semantic.yaml', before, after };
}

function withMetric(name: string, status: string, owner?: string, source = METRICS) {
  const start = source.indexOf(`- name: ${name}`);
  const end = source.indexOf('- name:', start + 1);
  const block = source.slice(start, end < 0 ? undefined : end);
  let changed = block.replace(/"status": "[a-z]+"/, `"status": "${status}"`);
  if (owner !== undefined) changed = changed.replace(/"owner": "[^"]*"/, `"owner": "${owner}"`);
  return source.replace(block, changed);
}

/** Runs a write and says what the guard did: allowed, demoted to proposed, or refused with the kind. */
function outcomeOf(name: TestUserName, change: FileChange): string {
  try {
    const outcome = personGuard(name)([change]);
    return outcome.demoted.length ? 'demoted' : 'allowed';
  } catch (error) {
    if (error instanceof GuardedChangeError) return `refused ${error.guarded.map(item => item.kind).join(' ')}`.replace(/metric-|item-/g, '');
    throw error;
  }
}

const metricApproved = withMetric('order_count', 'approved');
const metricProposed = withMetric('order_count', 'proposed');

test('the guard rules are switched on', () => {
  expect(ONTOLOGY_GUARDS_ACTIVE).toBe(true);
});

describe('a concept and a metric give the same outcome for the same person', () => {
  const people: TestUserName[] = ['alice', 'bob', 'hank', 'dave'];
  const scenarios: [string, () => FileChange, () => FileChange][] = [
    ['approving', () => metricChange(metricApproved, metricProposed), () => itemChange(ontology(governed('approved')), ontology(governed('proposed')))],
    ['proposing', () => metricChange(metricProposed), () => itemChange(ontology(governed('proposed')), null)],
    [
      'editing an approved item',
      () => metricChange(METRICS.replace("'SUM(orders.amount)'", "'SUM(orders.amount) * 2'")),
      () => itemChange(ontology(governed('approved', 'bob@example.org'), 'A changed order.', '    tessera_ai_context: Use this.\n'), ontology(governed('approved', 'bob@example.org'))),
    ],
    [
      'changing only the description',
      () => metricChange(METRICS.replace('Approved revenue metric owned by Bob.', 'Revenue after discounts.')),
      () => itemChange(ontology(governed('approved'), 'Another sentence.'), ontology(governed('approved'))),
    ],
  ];
  for (const [label, metric, item] of scenarios) {
    for (const name of people) {
      test(`${label} as ${name}`, () => {
        expect(outcomeOf(name, item())).toBe(outcomeOf(name, metric()));
      });
    }
  }
});

describe('approval and the owner rule', () => {
  test('an Editor may propose but not approve or deprecate', () => {
    expect(outcomeOf('alice', itemChange(ontology(governed('proposed')), null))).toBe('allowed');
    expect(outcomeOf('alice', itemChange(ontology(governed('approved')), ontology(governed('proposed'))))).toBe('refused status');
    expect(outcomeOf('alice', itemChange(ontology(governed('deprecated')), ontology(governed('approved'))))).toBe('refused status');
  });

  test('nobody approves an item they own, in any letter case', () => {
    for (const owner of ['bob@example.org', 'BOB@Example.ORG', ' bob@example.org ']) {
      const guard = personGuard('bob');
      expect(() => guard([itemChange(ontology(governed('approved', owner)), ontology(governed('proposed', owner)))])).toThrow('nobody approves or deprecates an item they own');
    }
  });

  test('handing the owner over in the same write does not hide self-approval', () => {
    const before = ontology(governed('proposed', 'bob@example.org'));
    const after = ontology(governed('approved', 'alice@example.org'));
    expect(outcomeOf('bob', itemChange(after, before))).toBe('refused status');
  });

  test('changing the owner or steward of an approved item needs an approver', () => {
    const before = ontology(governed('approved', 'carol@example.org'));
    const after = ontology(governed('approved', 'dana@example.org'));
    expect(outcomeOf('alice', itemChange(after, before))).toBe('refused status');
    expect(outcomeOf('bob', itemChange(after, before))).toBe('allowed');
    const steward = ontology(governed('approved', 'carol@example.org') + '      steward: eli@example.org\n');
    expect(outcomeOf('alice', itemChange(steward, before))).toBe('refused status');
  });

  test('a new file with an approved concept is an approval', () => {
    expect(outcomeOf('alice', itemChange(ontology(governed('approved')), null))).toBe('refused status');
  });

  test('an item with no status is never treated as approved', () => {
    const before = ontology('    tessera_governance:\n      owner: carol@example.org\n');
    const after = ontology('    tessera_governance:\n      owner: carol@example.org\n', 'A changed order.');
    expect(outcomeOf('alice', itemChange(after, before))).toBe('allowed');
  });
});

describe('approved item changes', () => {
  test('an edited approved concept is stored as proposed with only its status bytes changed', () => {
    const before = ontology(governed('approved'));
    const edited = ontology(governed('approved'), 'A customer order.', '    tessera_ai_context: Prefer this concept.\n');
    const outcome = personGuard('alice')([itemChange(edited, before)]);
    expect(outcome.demoted.map(change => change.pointer)).toEqual(['/ontology/0']);
    expect(outcome.changes[0].after).toBe(edited.replace('status: approved', 'status: proposed'));
    expect(personGuard('dave')([itemChange(edited, before)]).demoted).toEqual([]);
  });

  test('changing a relationship of an approved concept changes the concept and an approved relationship', () => {
    const relationship = (name: string) => `    relationships:\n      - name: ${name}\n        roles:\n          - concept: Customer\n        verbalizes:\n          - Order has Customer\n`;
    const before = ontology(governed('approved'), 'A customer order.', relationship('placed_by'));
    const after = ontology(governed('approved'), 'A customer order.', relationship('buyer'));
    expect(guardedChanges(itemChange(after, before), SETTINGS).map(change => change.kind)).toEqual(['item-body']);
  });

  test('removing an approved concept needs an approver and is never demoted', () => {
    const before = ontology(governed('approved'));
    const removed = 'tessera: 2\nversion: 0.2.0.dev0\nname: Retail\nontology: []\n';
    expect(outcomeOf('alice', itemChange(removed, before))).toBe('refused body');
    expect(outcomeOf('dave', itemChange(removed, before))).toBe('allowed');
  });

  test('the order list and notes are free on an approved item', () => {
    const before = ontology(governed('approved'));
    const after = ontology(governed('approved'), 'A customer order.', '    tessera_notes: A private note.\n');
    expect(outcomeOf('alice', itemChange(after, before))).toBe('allowed');
  });
});

describe('classification', () => {
  const classified = (value: string) => `    tessera_governance:\n      classification: ${value}\n`;

  test('changing a classification needs a Steward, like a contract property', () => {
    const before = ontology(classified('internal'));
    const after = ontology(classified('public'));
    expect(outcomeOf('alice', itemChange(after, before))).toBe('refused classification');
    expect(outcomeOf('bob', itemChange(after, before))).toBe('allowed');
  });

  test('any change to an item at or above the protected level needs a Steward', () => {
    const before = ontology(classified('sensitive'));
    const after = ontology(classified('sensitive'), 'Changed text.');
    expect(outcomeOf('alice', itemChange(after, before))).toBe('refused protected-property');
    expect(outcomeOf('bob', itemChange(after, before))).toBe('allowed');
    const internal = ontology(classified('internal'));
    expect(outcomeOf('alice', itemChange(ontology(classified('internal'), 'Changed text.'), internal))).toBe('allowed');
  });

  test('lowering the level of a protected item is still guarded', () => {
    expect(outcomeOf('alice', itemChange(ontology(classified('public')), ontology(classified('sensitive'))))).toBe('refused classification protected-property');
  });
});

test('documents that are not ontologies and unchanged files are never guarded', () => {
  expect(guardedChanges(itemChange('name: notes\n', 'name: notes\n'), SETTINGS)).toEqual([]);
  expect(guardedChanges(itemChange(ontology(governed('approved')), ontology(governed('approved'))), SETTINGS)).toEqual([]);
});
