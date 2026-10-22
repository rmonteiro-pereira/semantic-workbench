// Reads immutable access fixtures and maps test identities to trusted claims.
import { readFileSync } from 'node:fs';
import type { AccessConfig, AccessView } from '../../server/auth/authorize';
import type { ContentGuard } from '../../server/auth/guards';
import type { Reader } from '../../server/projects/reader';
import { normalizeClaims } from '../../server/auth/principal';
import { TEST_USERS, TEST_TENANT_ID, type TestUserName } from '../helpers/auth-identities';
import { AUTH_PROJECTS } from '../helpers/auth-workspace';

/** Access configuration backed solely by the test fixture. */
export function accessFixture() {
  const read = (name: string) =>
    JSON.parse(readFileSync(`tests/fixtures/auth-workspace/admin/${name}.json`, 'utf8'));
  const config: AccessConfig = {
    roles: read('roles').roles,
    grants: read('grants').grants,
    projects: read('projects'),
    agents: read('agents'),
    deactivated: read('deactivated'),
  };
  return {
    mode: 'server' as const,
    config,
    bootstrap: { emails: [], ids: [] },
    groupMatch: 'case-insensitive' as const,
    knownProjects: () => [...AUTH_PROJECTS],
  };
}

/** Normalized Entra identity for one fixture person. */
export function person(name: TestUserName) {
  const user = TEST_USERS[name];
  return normalizeClaims(
    {
      tid: TEST_TENANT_ID,
      oid: user.oid,
      name: user.name,
      preferred_username: user.upn,
      email: user.email,
      xms_edov: user.emailDomainVerified,
      groups: user.groups.map(group => group.id),
      roles: ['Admin'],
    },
    { provider: 'entra', tenantId: TEST_TENANT_ID, groupClaim: 'groups' },
  );
}

/**
 * A server reader for tests of read boundaries. Governance has its own tests, so this reader's
 * guard lets every change through unchanged.
 */
export function boundaryReader(view: AccessView, owner: string): Reader {
  const guard: ContentGuard = changes => ({ changes, refused: [], demoted: [] });
  return { view, owner, guard };
}
