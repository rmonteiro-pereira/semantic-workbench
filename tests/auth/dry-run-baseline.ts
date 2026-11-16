// Replays the original audit sample against a policy with one removed custom-role grant.
import { createAuditLog } from '../../src/server/auth/audit';
import { compareAccess, isReplayable, MAX_AUDIT_SNAPSHOTS } from '../../src/server/auth/dry-run';
import { accessFixture, person } from './access-fixture';

/** Computes the original administration comparison from fixed audit records. */
export function dryRunBaseline() {
  const options = accessFixture();
  const next = structuredClone(options.config);
  next.grants = next.grants.filter(grant => grant.roleId !== 'r_metric_reviewer');
  const audit = createAuditLog({ dir: 'tests/fixtures/dry-run', now: () => new Date('2026-03-15T12:00:00Z') });
  return compareAccess(options, next, {
    users: [person('alice'), person('hank'), person('dave')],
    audit: audit.recent(MAX_AUDIT_SNAPSHOTS, isReplayable),
  });
}
