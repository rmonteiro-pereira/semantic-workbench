// Tells a person which role an action needs, in the role names the workspace shows them.
import { ACTIONS, type Action } from '../../shared/auth/actions';
import builtin from '../../../policies/builtin-roles.json';
import type { Role } from './access-config';

/** Role names keyed by role id, as /api/me lists them. */
export type RoleNames = Record<string, string>;

/**
 * The display name of every role in the current policy. Built-in roles may be renamed by
 * `builtinNames`; custom roles always show the name their definition has now, so a rename takes
 * effect with the next policy reload.
 */
export function currentRoleNames(customRoles: Role[], builtinNames: RoleNames = {}): RoleNames {
  const names: RoleNames = {};
  for (const role of builtin.roles) names[role.id] = builtinNames[role.id] ?? role.name;
  for (const role of customRoles) names[role.id] = role.name;
  return names;
}

function displayName(role: Role, roleNames: RoleNames): string {
  return roleNames[role.id] ?? role.name;
}

function isBuiltin(role: Role): boolean {
  return builtin.roles.some(builtinRole => builtinRole.id === role.id);
}

function grantsAction(role: Role, action: Action): boolean {
  return role.permissions.some(permission => permission.actions.includes(action));
}

/**
 * Names, for each action, the lowest built-in role that allows it. When only the person's own
 * custom roles allow it, those roles are named instead, because they are what the person holds.
 */
export function roleRequirements(customRoles: Role[], heldRoleIds: string[], roleNames: RoleNames): Record<Action, string> {
  const held = new Set(heldRoleIds);
  const builtinRoles = builtin.roles as Role[];
  const roles = [...builtinRoles, ...customRoles];
  const requirements = ACTIONS.map(action => {
    const sources = roles.filter(role => held.has(role.id) && grantsAction(role, action));
    const customOnly = sources.length > 0 && sources.every(role => !isBuiltin(role));
    const lowest = builtinRoles.find(role => grantsAction(role, action));
    let names: string | undefined;
    if (customOnly) {
      names = sources.map(role => displayName(role, roleNames)).join(' or ');
    } else if (lowest) {
      names = displayName(lowest, roleNames);
    }
    return [action, `Requires ${names ?? 'permission'}`];
  });
  return Object.fromEntries(requirements) as Record<Action, string>;
}
