// The actions access decisions are made about, grouped as the role matrix groups them, and which
// role conditions each action can carry.

/** Every action of the policy model, in the order the role matrix lists them. */
export const ACTIONS = [
  'read',
  'export',
  'history',
  'viewOwnState',
  'edit',
  'createMetric',
  'import',
  'move',
  'delete',
  'revert',
  'restoreOwn',
  'approveMetric',
  'editGuarded',
  'restoreOthers',
  'publish',
  'stage',
  'commit',
  'branch',
  'fetch',
  'pull',
  'push',
  'cancelOwn',
  'purge',
  'clear',
  'createProject',
  'renameProject',
  'deleteProject',
  'setRemote',
  'clone',
  'registerProjects',
  'setIdentity',
  'readStatus',
  'readAudit',
  'admin',
  'agentRead',
] as const;

/** One action of the policy model. */
export type Action = (typeof ACTIONS)[number];

/** Actions that only read; a person who may not read a resource gets 404 for any action on it. */
export const READ_ACTIONS: readonly Action[] = ['read', 'export', 'history', 'viewOwnState'];

/** Actions a request can make on one file, so path, type and level conditions apply to them. */
export const FILE_ACTIONS: readonly Action[] = [...READ_ACTIONS, 'edit', 'createMetric', 'import', 'move', 'delete', 'revert', 'approveMetric', 'editGuarded'];

/** Actions that work on a branch, so a branch condition applies to them. */
export const BRANCH_ACTIONS: readonly Action[] = ['publish', 'stage', 'commit', 'branch', 'fetch', 'pull', 'push', 'cancelOwn'];

/** Actions a custom role may hold: everything except managing access and the agent-only read. */
export const CUSTOM_ROLE_ACTIONS: readonly Action[] = ACTIONS.filter(action => action !== 'admin' && action !== 'agentRead');

/** Tells whether a value names an action of the policy model. */
export function isAction(value: unknown): value is Action {
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value);
}

/** Classification levels, defined with the governance rules the browser shares. */
export { LEVELS, levelNumber, type Level } from '../governance/guards';

/** Reserved roles supplied by the built-in policy model. */
export const BUILTIN_ROLE_IDS: readonly string[] = ['viewer', 'editor', 'steward', 'admin'];
