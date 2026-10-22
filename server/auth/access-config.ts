// Validates administration input once before a new access configuration becomes active.
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from '../../schemas/semantic-workbench-access-v1.json';
import { BUILTIN_ROLE_IDS, type Action, type Level } from './actions';
import { validateCustomRole } from './role-compiler';

/** The workspace, domains, or named projects covered by a grant. */
export type GrantScope =
  | { kind: 'workspace' }
  | { kind: 'domains'; domains: string[] }
  | { kind: 'projects'; projects: string[] };
/** A role assignment to a group or verified address. */
export type Grant = {
  id: string;
  roleId: string;
  member:
    | { kind: 'group'; groupId: string; displayName?: string; resolvedAt?: string }
    | { kind: 'email'; email: string };
  scope: GrantScope;
  addedBy: string;
  addedAt: string;
};
/** Restrictions that must all hold for one role permission. */
export type Conditions = { branch?: string; path?: string; docType?: string[]; maxLevel?: Level };
/** A named set of permissions compiled into Cedar policies. */
export type Role = {
  id: string;
  name: string;
  description: string;
  permissions: { actions: Action[]; conditions?: Conditions }[];
  createdBy?: string;
  createdAt?: string;
};
/** Domain membership, restricted paths, and classification settings. */
export type ProjectsConfig = {
  formatVersion?: 1;
  domains: { id: string; name: string }[];
  projects: Record<
    string,
    {
      domain?: string;
      everyoneCanRead?: boolean;
      stewards: string[];
      restricted: { pattern: string; groups: string[]; emails: string[] }[];
      protectedBranches: string[];
      protectedLevel?: Level;
    }
  >;
  classification: { levels: Level[]; aliases: Record<string, Level>; protectedLevel: Level };
};

/** Project and domain assignments for application clients. */
export type AgentsConfig = {
  formatVersion?: 1;
  clients: { clientId: string; name: string; projects: string[]; domains: string[] }[];
};
/** Recorded identities disabled by an administrator. */
export type DeactivatedConfig = {
  formatVersion?: 1;
  principals: { id: string; at: string; by: string; reason: string }[];
};
/** Validated input used to build one immutable access configuration. */
export type AccessConfig = {
  adminRules?: Record<string, string>;
  roles: Role[];
  grants: Grant[];
  projects: ProjectsConfig;
  agents: AgentsConfig;
  deactivated: DeactivatedConfig;
};
/** An administration document that does not satisfy its schema or references. */
export class AccessConfigError extends Error {}

const validator = new Ajv2020({ allErrors: true });
addFormats(validator);
validator.addSchema(schema);

/** Checks a document against one definition in the shipped administration schema. */
export function validateAccessDocument(name: string, value: unknown): void {
  const check = validator.getSchema(`semantic-workbench/access/v1#/$defs/${name}`);
  if (!check) throw new AccessConfigError(`Unknown access document: ${name}`);
  if (!check(value)) {
    throw new AccessConfigError(`${name}: ${validator.errorsText(check.errors)}`);
  }
}

/** Copies and validates configuration so later caller mutations cannot change decisions. */
export function validateAccessConfig(input: AccessConfig): AccessConfig {
  const config = structuredClone(input);
  validateAccessDocument('rolesFile', { formatVersion: 1, roles: config.roles });
  validateAccessDocument('grantsFile', { formatVersion: 1, grants: config.grants });
  validateAccessDocument('projectsFile', { formatVersion: 1, ...config.projects });
  validateAccessDocument('agentsFile', { formatVersion: 1, ...config.agents });
  validateAccessDocument('deactivatedFile', { formatVersion: 1, ...config.deactivated });
  const roleIds = new Set([...BUILTIN_ROLE_IDS, ...config.roles.map(role => role.id)]);
  const names = new Set<string>(BUILTIN_ROLE_IDS);
  const ids = new Set<string>(BUILTIN_ROLE_IDS);
  config.adminRules ??= {};
  for (const role of config.roles) {
    validateCustomRole(role);
    if (ids.has(role.id)) throw new AccessConfigError(`Duplicate role id: ${role.id}`);
    ids.add(role.id);
    const name = role.name.toLowerCase();
    if (names.has(name)) throw new AccessConfigError(`Duplicate role name: ${role.name}`);
    names.add(name);
  }
  for (const grant of config.grants) {
    if (!roleIds.has(grant.roleId)) {
      throw new AccessConfigError(`${grant.id}: unknown role ${grant.roleId}`);
    }
    if (grant.roleId === 'admin' && grant.scope.kind !== 'workspace') {
      throw new AccessConfigError(`${grant.id}: Admin requires workspace scope.`);
    }
  }
  return config;
}
