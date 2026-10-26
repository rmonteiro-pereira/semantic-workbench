// Governance guards: who may approve metrics, what happens to an edited approved metric, and who
// may change classifications and protected properties.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createAccessControl } from '../../src/server/auth/authorize';
import { requestAccess, requestReader } from '../../src/server/auth/request-scope';
import { GuardedChangeError } from '../../src/server/auth/guards';
import {
  classificationLevel,
  guardedChanges,
  type ClassificationSettings,
  type FileChange,
} from '../../src/server/auth/guards';
import { clientPrincipal, type NormalizedPrincipal } from '../../src/server/auth/principal';
import type { TestUserName } from '../helpers/auth-identities';
import { accessFixture, person } from './access-fixture';

const FIXTURE = 'tests/fixtures/auth-workspace/projects/';
const METRICS = readFileSync(FIXTURE + 'sales-metrics/sales.semantic.yaml', 'utf8');
const CONTRACT = readFileSync(FIXTURE + 'sales-contracts/orders.odcs.yaml', 'utf8');
const SETTINGS: ClassificationSettings = {
  aliases: { sensitive: 'confidential', pii: 'confidential', secret: 'restricted' },
  protectedLevel: 'confidential',
};

/** The guard a request's reader carries for one fixture person, optionally with other claims. */
function personGuard(name: TestUserName, claims: Partial<NormalizedPrincipal> = {}) {
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor({ ...person(name), ...claims });
  const request = new Request('http://localhost/api');
  Object.assign(request, { [requestAccess]: access.forRequest(principal) });
  return requestReader(request).guard!;
}

function metricChange(after: string, before = METRICS): FileChange {
  return { project: 'sales-metrics', path: 'sales.semantic.yaml', before, after };
}

function contractChange(after: string, before = CONTRACT): FileChange {
  return { project: 'sales-contracts', path: 'orders.odcs.yaml', before, after };
}

/** The fixture metrics file with one metric's status and owner replaced. */
function withMetric(name: string, status: string, owner?: string, source = METRICS) {
  const start = source.indexOf(`- name: ${name}`);
  const end = source.indexOf('- name:', start + 1);
  const block = source.slice(start, end < 0 ? undefined : end);
  let changed = block.replace(/"status": "[a-z]+"/, `"status": "${status}"`);
  if (owner !== undefined) changed = changed.replace(/"owner": "[^"]*"/, `"owner": "${owner}"`);
  return source.replace(block, changed);
}

/** The refusal a guard throws, or null when the write is allowed. */
function refusal(run: () => unknown): GuardedChangeError | null {
  try {
    run();
    return null;
  } catch (error) {
    if (error instanceof GuardedChangeError) return error;
    throw error;
  }
}

describe('metric approval', () => {
  test('an Editor may propose but not approve or deprecate', () => {
    const guard = personGuard('alice');
    const proposed = withMetric('average_order_value', 'proposed');
    expect(guard([metricChange(proposed)]).changes[0].after).toBe(proposed);
    const approved = refusal(() => guard([metricChange(withMetric('order_count', 'approved'))]));
    expect(approved?.guarded).toEqual([
      { file: 'sales.semantic.yaml', pointer: '/metrics/1', kind: 'metric-status' },
    ]);
    expect(approved?.decision.status).toBe(403);
    const deprecated = withMetric('gross_revenue', 'deprecated').replace(
      '"status": "deprecated"',
      '"status": "deprecated", "deprecation_reason": "Replaced"',
    );
    expect(refusal(() => guard([metricChange(deprecated)]))?.guarded[0].kind).toBe('metric-status');
  });

  test('a Steward or the metric reviewer approves a metric owned by someone else', () => {
    const approved = withMetric('order_count', 'approved');
    for (const name of ['bob', 'hank', 'dave'] as const) {
      expect(refusal(() => personGuard(name)([metricChange(approved)]))).toBeNull();
    }
  });

  test('nobody approves their own metric, whatever their role', () => {
    const owners = { bob: 'bob@example.org', hank: 'hank@example.org', dave: 'dave@example.org' };
    for (const [name, owner] of Object.entries(owners) as [TestUserName, string][]) {
      const own = withMetric('order_count', 'approved', owner);
      const before = withMetric('order_count', 'proposed', owner);
      const refused = refusal(() => personGuard(name)([metricChange(own, before)]));
      expect(refused?.message).toContain('nobody approves or deprecates a metric they own');
      expect(refused?.decision.rules).toContain('F1-no-self-approval');
    }
  });

  test('changing the owner in the same write does not hide self-approval', () => {
    const bob = personGuard('bob');
    const takeOver = withMetric('order_count', 'approved', 'bob@example.org');
    expect(refusal(() => bob([metricChange(takeOver)]))).not.toBeNull();
    const before = withMetric('order_count', 'proposed', 'bob@example.org');
    const handOver = withMetric('order_count', 'approved', 'alice@example.org');
    expect(refusal(() => bob([metricChange(handOver, before)]))).not.toBeNull();
  });

  test('owners match the e-mail address or the username in any letter case', () => {
    const dave = personGuard('dave', { username: 'DaveD' });
    for (const owner of ['DAVE@example.ORG', 'daved', ' DaveD ']) {
      const own = withMetric('order_count', 'approved', owner);
      expect(
        refusal(() => dave([metricChange(own)])),
        owner,
      ).not.toBeNull();
    }
  });

  test('an owner value that matches nobody counts as no owner', () => {
    const unverified = withMetric('order_count', 'approved', 'Sales analytics team');
    expect(refusal(() => personGuard('bob')([metricChange(unverified)]))).toBeNull();
    expect(refusal(() => personGuard('alice')([metricChange(unverified)]))).not.toBeNull();
  });
});

describe('approved metric changes', () => {
  test('an edited approved metric is stored as proposed with only its status bytes changed', () => {
    const edited = METRICS.replace("'SUM(orders.amount)'", "'SUM(orders.amount) * 2'");
    for (const name of ['alice', 'bob'] as const) {
      const outcome = personGuard(name)([metricChange(edited)]);
      expect(outcome.demoted.map(change => change.pointer)).toEqual(['/metrics/0']);
      const stored = outcome.changes[0].after!;
      expect(stored).toBe(
        edited.replace(
          '"owner": "bob@example.org", "status": "approved"',
          '"owner": "bob@example.org", "status": "proposed"',
        ),
      );
      expect(stored.length).toBe(edited.length);
    }
    const admin = personGuard('dave')([metricChange(edited)]);
    expect(admin.demoted).toEqual([]);
    expect(admin.changes[0].after).toBe(edited);
  });

  test('a description-only change keeps the metric approved', () => {
    const edited = METRICS.replace(
      'Approved revenue metric owned by Bob.',
      'Revenue after discounts.',
    );
    const outcome = personGuard('alice')([metricChange(edited)]);
    expect(outcome.demoted).toEqual([]);
    expect(outcome.changes[0].after).toBe(edited);
  });

  test('removing an approved metric needs someone who may approve it', () => {
    const start = METRICS.indexOf('  - name: gross_revenue');
    const end = METRICS.indexOf('  - name: order_count');
    const removed = METRICS.slice(0, start) + METRICS.slice(end);
    expect(refusal(() => personGuard('alice')([metricChange(removed)]))?.guarded[0].kind).toBe(
      'metric-body',
    );
    expect(refusal(() => personGuard('dave')([metricChange(removed)]))).toBeNull();
  });

  test('a new file with an approved metric is an approval', () => {
    const created = { ...metricChange(METRICS), before: null };
    expect(refusal(() => personGuard('alice')([created]))).not.toBeNull();
  });
});

describe('classification guards', () => {
  const kinds = [
    ['classification: internal', 'classification: public', 'classification'],
    ['criticalDataElement: true', 'criticalDataElement: false', 'critical-data-element'],
    ['status: active', 'status: active\nteam:\n  - username: alice', 'team'],
    ['status: active', 'status: active\nroles:\n  - role: analyst', 'roles'],
  ] as const;

  test('classification, critical data element, team and roles changes need a Steward', () => {
    for (const [from, to, kind] of kinds) {
      const after = CONTRACT.replace(from, to);
      const refused = refusal(() => personGuard('alice')([contractChange(after)]));
      expect(refused?.guarded.map(item => item.kind)).toContain(kind);
      expect(refused?.message).toContain('needs Steward');
      expect(refusal(() => personGuard('bob')([contractChange(after)]))).toBeNull();
    }
  });

  test('any part of a property at or above the protected level needs a Steward', () => {
    const protectedEdit = CONTRACT.replace('Customer e-mail address.', 'Contact address.');
    const refused = refusal(() => personGuard('alice')([contractChange(protectedEdit)]));
    expect(refused?.guarded).toEqual([
      { file: 'orders.odcs.yaml', pointer: '/schema/0/properties/1', kind: 'protected-property' },
    ]);
    expect(refusal(() => personGuard('bob')([contractChange(protectedEdit)]))).toBeNull();
    const internalEdit = CONTRACT.replace('Order amount in USD.', 'Order amount.');
    expect(refusal(() => personGuard('alice')([contractChange(internalEdit)]))).toBeNull();
  });

  test('the protected level is a setting', () => {
    const protectedEdit = CONTRACT.replace('Customer e-mail address.', 'Contact address.');
    const change = contractChange(protectedEdit);
    const restricted = { ...SETTINGS, protectedLevel: 'restricted' as const };
    expect(guardedChanges(change, restricted)).toEqual([]);
    expect(guardedChanges(change, SETTINGS).map(item => item.kind)).toEqual(['protected-property']);
  });

  test('aliases map free text to levels and everything else counts as internal', () => {
    expect(classificationLevel('PII', SETTINGS.aliases)).toBe('confidential');
    expect(classificationLevel('secret', SETTINGS.aliases)).toBe('restricted');
    expect(classificationLevel(' Restricted ', SETTINGS.aliases)).toBe('restricted');
    expect(classificationLevel('public', SETTINGS.aliases)).toBe('public');
    expect(classificationLevel('team only', SETTINGS.aliases)).toBe('internal');
    expect(classificationLevel(undefined, SETTINGS.aliases)).toBe('internal');
    const aliased = CONTRACT.replace('classification: internal', 'classification: sensitive');
    const edited = aliased.replace('Order amount in USD.', 'Order amount.');
    const kindsOf = guardedChanges(contractChange(edited, aliased), SETTINGS).map(
      item => item.kind,
    );
    expect(kindsOf).toEqual(['protected-property']);
  });

  test('reordering properties changes nothing that is guarded', () => {
    const lines = CONTRACT.split('\n');
    const email = lines.findIndex(line => line.includes('- name: customer_email'));
    const amount = lines.findIndex(line => line.includes('- name: amount'));
    const reordered = [
      ...lines.slice(0, email),
      ...lines.slice(amount, amount + 4),
      ...lines.slice(email, amount),
      ...lines.slice(amount + 4),
    ].join('\n');
    expect(guardedChanges(contractChange(reordered), SETTINGS)).toEqual([]);
  });

  test('reading and unguarded files are never affected', () => {
    const notes = { project: 'lab-notes', path: 'a.txt', before: 'x', after: 'not a document' };
    expect(guardedChanges(notes, SETTINGS)).toEqual([]);
    expect(personGuard('alice')([notes]).refused).toEqual([]);
  });
});

test('a repeated metric name cannot hide an approved copy', () => {
  const start = METRICS.indexOf('  - name: gross_revenue');
  const end = METRICS.indexOf('  - name: order_count');
  const copy = METRICS.slice(start, end).replace('Approved revenue', 'Second copy');
  const duplicated = METRICS.slice(0, end) + copy + METRICS.slice(end);
  // The first copy changes; the second, identical one must not stand in for it.
  const edited = duplicated.replace("'SUM(orders.amount)'", "'SUM(orders.amount) * 2'");
  const kinds = guardedChanges(metricChange(edited, duplicated), SETTINGS).map(item => item.kind);
  expect(kinds).toEqual(['metric-body']);
});

test('an agent client reader carries a guard that refuses every guarded change', () => {
  const access = createAccessControl(accessFixture());
  const request = new Request('http://localhost/api');
  const client = access.principalFor(clientPrincipal('sw-agent'));
  Object.assign(request, { [requestAccess]: access.forRequest(client) });
  const guard = requestReader(request).guard!;
  const reclassified = CONTRACT.replace('classification: internal', 'classification: public');
  expect(() => guard([contractChange(reclassified)])).toThrow(GuardedChangeError);
});
