// Matches explicit grants and expands their scopes into role-holder membership without I/O.
import type { Grant, GrantScope } from './access-config';
import type { NormalizedPrincipal } from './principal';

/** Configuration types retained for existing grant callers. */
export type { GrantScope, Grant, Conditions, Role, ProjectsConfig } from './access-config';
/** A matched assignment and the identity claim that supplied it. */
export type MatchedGrant = {
  grantId: string;
  roleId: string;
  scope: GrantScope;
  via: 'group' | 'email' | 'bootstrap' | 'local';
  group?: string;
};
/** Emergency Admin identities configured outside the administration repository. */
export type Bootstrap = { emails: string[]; ids: string[] };
/** Provider comparison and deactivation rules applied to grant matching. */
export type GrantOptions = {
  bootstrap: Bootstrap;
  deactivated: string[];
  groupMatch: 'case-insensitive' | 'exact';
};
type GrantIdentity = Pick<
  NormalizedPrincipal,
  'id' | 'groups' | 'groupsResolved' | 'verifiedEmail'
>;

/** Finds the union of explicit grants and bootstrap membership for an identity. */
export function resolveGrants(
  principal: GrantIdentity,
  grants: Grant[],
  options: GrantOptions,
): MatchedGrant[] {
  if (options.deactivated.includes(principal.id)) return [];
  const normalize = (value: string) =>
    options.groupMatch === 'exact' ? value : value.toLowerCase();
  const groups = new Set(principal.groups.map(normalize));
  const email = principal.verifiedEmail?.toLowerCase();
  const matched: MatchedGrant[] = [];
  for (const grant of grants) {
    const member = grant.member;
    const matches =
      member.kind === 'group'
        ? principal.groupsResolved !== 'failed' && groups.has(normalize(member.groupId))
        : email !== undefined && email === member.email.toLowerCase();
    if (!matches) continue;
    matched.push({
      grantId: grant.id,
      roleId: grant.roleId,
      scope: grant.scope,
      via: member.kind,
      ...(member.kind === 'group' ? { group: member.groupId } : {}),
    });
  }
  if (
    options.bootstrap.ids.includes(principal.id) ||
    (email && options.bootstrap.emails.some(value => value.toLowerCase() === email))
  ) {
    matched.push({
      grantId: 'bootstrap',
      roleId: 'admin',
      scope: { kind: 'workspace' },
      via: 'bootstrap',
    });
  }
  return matched;
}

/** Expands a grant to role holders, preserving the explicit-project distinction. */
export function holdersOfGrant(
  grant: Pick<Grant, 'roleId' | 'scope'>,
  projects: { slug: string; domain: string | null }[],
): string[] {
  const { roleId, scope } = grant;
  if (roleId === 'admin') {
    if (scope.kind !== 'workspace') throw new Error('Admin grants require workspace scope.');
    return ['admin@workspace'];
  }
  if (scope.kind === 'workspace') {
    return [
      `${roleId}@workspace`,
      ...projects.filter(project => project.domain).map(project => `${roleId}@${project.slug}`),
    ];
  }
  if (scope.kind === 'domains') {
    return projects
      .filter(project => project.domain && scope.domains.includes(project.domain))
      .map(project => `${roleId}@${project.slug}`);
  }
  return projects
    .filter(project => scope.projects.includes(project.slug))
    .flatMap(project => [`${roleId}@${project.slug}`, `explicit@${project.slug}`]);
}

/** Lists recorded Admin holders and the independent number of bootstrap entries. */
export function adminHolders(users: GrantIdentity[], grants: Grant[], bootstrap: Bootstrap) {
  // Directory object ids are case-insensitive; named provider groups remain exact.
  const groupId = (value: string) =>
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : value;
  const admins = grants
    .filter(grant => grant.roleId === 'admin')
    .map(grant => {
      if (grant.member.kind !== 'group') return grant;
      return { ...grant, member: { ...grant.member, groupId: groupId(grant.member.groupId) } };
    });
  const options: GrantOptions = {
    bootstrap: { emails: [], ids: [] },
    deactivated: [],
    groupMatch: 'exact',
  };
  const ids = users
    .filter(
      user =>
        resolveGrants({ ...user, groups: user.groups.map(groupId) }, admins, options).length > 0,
    )
    .map(user => user.id);
  return { ids: [...new Set(ids)], bootstrapCount: bootstrap.emails.length + bootstrap.ids.length };
}
