// A refusal names only what the person may read: a guarded change in a file they cannot read
// never lends its metric name to the message.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createAccessControl } from '../../server/auth/authorize';
import { GuardedChangeError, type FileChange } from '../../server/auth/guards';
import { requestAccess, requestReader } from '../../server/auth/request-scope';
import { accessFixture, person } from './access-fixture';

const METRICS = readFileSync(
  'tests/fixtures/auth-workspace/projects/sales-metrics/sales.semantic.yaml',
  'utf8',
);

function aliceGuard() {
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const request = new Request('http://localhost/api');
  Object.assign(request, { [requestAccess]: access.forRequest(principal) });
  return requestReader(request).guard!;
}

/** The fixture metrics with order_count changed to a status and owner. */
function withOrderCount(status: string, owner: string) {
  const start = METRICS.indexOf('- name: order_count');
  const end = METRICS.indexOf('- name:', start + 1);
  const block = METRICS.slice(start, end < 0 ? undefined : end);
  const changed = block
    .replace(/"status": "[a-z]+"/, `"status": "${status}"`)
    .replace(/"owner": "[^"]*"/, `"owner": "${owner}"`);
  return METRICS.replace(block, changed);
}

// Alice owns the metric in a restricted file she cannot read, so approving it is refused as a
// self-approval that names the metric.
const hiddenOwn: FileChange = {
  project: 'sales-contracts',
  path: 'finance/sales.semantic.yaml',
  before: withOrderCount('proposed', 'alice@example.org'),
  after: withOrderCount('approved', 'alice@example.org'),
};
const readableApproval: FileChange = {
  project: 'sales-metrics',
  path: 'sales.semantic.yaml',
  before: METRICS,
  after: withOrderCount('approved', 'bob@example.org'),
};

function refusalOf(changes: FileChange[]) {
  try {
    aliceGuard()(changes);
  } catch (error) {
    if (error instanceof GuardedChangeError) return error;
    throw error;
  }
  throw Error('Expected the write to be refused.');
}

describe('refusal text', () => {
  test('names the first refused change the person can read, not a hidden one before it', () => {
    const refused = refusalOf([hiddenOwn, readableApproval]);
    expect(refused.message).toContain('approving or deprecating a metric');
    expect(refused.message).not.toContain('order_count');
    expect(refused.guarded.map(item => item.file)).toEqual(['sales.semantic.yaml']);
  });

  test('is generic when every refused change is in a file the person cannot read', () => {
    const refused = refusalOf([hiddenOwn]);
    expect(refused.message).toContain('a guarded change');
    expect(refused.message).not.toContain('order_count');
    expect(refused.message).not.toContain('they own');
    expect(refused.guarded).toEqual([]);
  });

  test('keeps the audit record on the first refused change', () => {
    const refused = refusalOf([hiddenOwn, readableApproval]);
    expect(refused.decision.rules).toContain('F1-no-self-approval');
    expect(refused.resource).toEqual({
      type: 'file',
      project: 'sales-contracts',
      path: 'finance/sales.semantic.yaml',
    });
  });
});
