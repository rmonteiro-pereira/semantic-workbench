// Compiles role permissions into Cedar text without loading the engine or reading files.
import { BUILTIN_ROLE_IDS, BRANCH_ACTIONS, FILE_ACTIONS, isAction, LEVELS } from '../../shared/auth/actions';
import type { Conditions, Role } from './access-config';

/** A role that cannot safely compile against the access schema. */
export class RoleError extends Error {}

function validatePermission(role: Role, permission: Role['permissions'][number]) {
  if (!permission.actions.length) throw new RoleError(`${role.id}: permission needs actions.`);
  for (const action of permission.actions) {
    if (!isAction(action)) throw new RoleError(`${role.id}: unknown action ${action}.`);
    if (role.id.startsWith('r_') && (action === 'admin' || action === 'agentRead')) {
      throw new RoleError(`${role.id}: custom roles cannot grant ${action}.`);
    }
  }
  const conditions = permission.conditions ?? {};
  const fileCondition = conditions.path !== undefined || conditions.docType !== undefined || conditions.maxLevel !== undefined;
  if (fileCondition && !permission.actions.every(action => FILE_ACTIONS.includes(action))) {
    throw new RoleError(`${role.id}: file conditions require file actions.`);
  }
  if (conditions.branch !== undefined && !permission.actions.every(action => BRANCH_ACTIONS.includes(action))) {
    throw new RoleError(`${role.id}: branch conditions require branch actions.`);
  }
  if (conditions.maxLevel !== undefined && !LEVELS.includes(conditions.maxLevel)) {
    throw new RoleError(`${role.id}: unknown classification level.`);
  }
  for (const glob of [conditions.path, conditions.branch]) {
    if (glob !== undefined && (!glob || /[?\\]/.test(glob) || glob.startsWith('/') || glob.split('/').includes('..'))) {
      throw new RoleError(`${role.id}: invalid relative glob ${glob}.`);
    }
  }
}

/** Refuses custom role ids and permissions that would change built-in authority. */
export function validateCustomRole(role: Role): void {
  if (BUILTIN_ROLE_IDS.includes(role.id) || !/^r_[a-z0-9_]+$/.test(role.id)) {
    throw new RoleError(`${role.id}: custom role ids must start with r_.`);
  }
  if (!role.permissions.length) throw new RoleError(`${role.id}: role needs permissions.`);
  for (const permission of role.permissions) validatePermission(role, permission);
}

function clauses(conditions: Conditions): string[] {
  const result: string[] = [];
  if (conditions.path !== undefined) {
    result.push(`resource.path like ${JSON.stringify(conditions.path.replace(/\*+/g, '*'))}`);
  }
  if (conditions.docType !== undefined) {
    result.push(`[${conditions.docType.map(value => JSON.stringify(value)).join(', ')}]` + '.contains(resource.docType)');
  }
  if (conditions.maxLevel !== undefined) {
    result.push(`context.level <= ${LEVELS.indexOf(conditions.maxLevel)}`);
  }
  if (conditions.branch !== undefined) {
    result.push(`context.branch like ${JSON.stringify(conditions.branch.replace(/\*+/g, '*'))}`);
  }
  return result;
}

/** Compiles role policies, the schema holder record, and memoisation path conditions. */
export function compileRoles(roles: Role[]) {
  const policies: Record<string, string> = {};
  const pathGlobs = new Set<string>();
  for (const role of roles) {
    if (role.id === 'admin') {
      policies['role:admin:1'] = '@id("role:admin:1")\n' + 'permit (principal in SW::RoleHolder::"admin@workspace", action, resource);';
      continue;
    }
    role.permissions.forEach((permission, index) => {
      const id = `role:${role.id}:${index + 1}`;
      const actions = permission.actions.map(action => `SW::Action::"${action}"`).join(', ');
      const conditions = [`principal in resource.holders.${role.id}`, ...clauses(permission.conditions ?? {})];
      policies[id] = `@id("${id}")\npermit (principal, action in [${actions}], resource)\n` + `when { ${conditions.join(' && ')} };`;
      if (permission.conditions?.path) pathGlobs.add(permission.conditions.path);
    });
  }
  const holders = roles
    .filter(role => role.id !== 'admin')
    .map(role => `"${role.id}": SW::RoleHolder`)
    .join(', ');
  return {
    policies,
    holdersFragment: `namespace Roles { type Holders = { ${holders} }; }`,
    pathGlobs: [...pathGlobs],
  };
}
