// Compares decisions using the real access boundary without changing the active configuration.
import { createAccessControl, type AccessOptions } from './authorize';
import { ACTIONS, FILE_ACTIONS, isAction, type Action } from '../../shared/auth/actions';
import type { AccessConfig } from './access-config';
import { clientPrincipal, type NormalizedPrincipal } from './principal';
import type { ResourceRef } from './resource';
import type { AuditEntry } from './audit';
import matrix from '../../../policies/matrix-cases.json';

/** A known identity's changed permissions on one project. */
export type AccessChange = {
  principal: string;
  /** The person's or client's display name, or the identifier when none is known. */
  name: string;
  project: string;
  gained: Action[];
  lost: Action[];
  access: 'kept' | 'gained' | 'lost';
};
/** One replayed request whose decision differs between the active and the proposed set. */
export type ChangedDecision = { case: string; before: boolean; after: boolean; rules: string[] };

import { sampleReplayEntries } from './replay-sample';
export { MAX_AUDIT_SNAPSHOTS, isReplayable } from './replay-sample';

type AccessControl = ReturnType<typeof createAccessControl>;
type RequestScope = ReturnType<AccessControl['forRequest']>;
/** The same identity evaluated by the active and by the proposed boundary. */
type ScopePair = { before: RequestScope; after: RequestScope };

/** Captures the active policy and clock, then builds paired replay scopes on demand. */
export function scopeCache(access: AccessControl, proposal: AccessConfig) {
  const active = access.snapshot();
  const context = { ...active.context?.() };
  const projects = [...active.knownProjects()];
  const environment = { knownProjects: () => [...projects], context: () => ({ ...context }) };
  const before = access.fork(active.config, environment);
  const snapshot = before.snapshot();
  const current = active.config;
  const after = before.fork(proposal);
  const next = after.snapshot().config;
  const scopes = new Map<string, ScopePair>();
  // Arbitrary Cedar rules can inspect other identities and otherwise unused role holders.
  const comparable = !Object.keys(current.adminRules ?? {}).length && !Object.keys(next.adminRules ?? {}).length;
  const sameProjects = JSON.stringify(current.projects) === JSON.stringify(next.projects);
  function scopeFor(identity: NormalizedPrincipal): ScopePair {
    const key = JSON.stringify(identity);
    let pair = scopes.get(key);
    if (!pair) {
      const previous = before.principalFor(identity);
      const proposed = after.principalFor(identity);
      // Cedar group ancestry can still differ when deactivation hides resolved grants.
      const activePerson = !previous.deactivated && !proposed.deactivated;
      const unchanged = comparable && sameProjects && activePerson && principalPolicy(current, previous) === principalPolicy(next, proposed);
      const previousScope = before.forReplay(previous, context);
      pair = { before: previousScope, after: unchanged ? previousScope : after.forReplay(proposed, context) };
      scopes.set(key, pair);
    }
    return pair;
  }
  return { snapshot, scopeFor };
}

function principalPolicy(config: AccessConfig, principal: RequestScope['principal']) {
  const roles = new Set(principal.grants.map(grant => grant.roleId));
  return JSON.stringify({
    principal,
    roles: config.roles.filter(role => roles.has(role.id)),
    client: config.agents.clients.find(client => client.clientId === principal.clientId),
  });
}

/** Rebuilds the identity an audit snapshot was decided for, with its groups and address. */
function snapshotIdentity(entry: AuditEntry, identities: Map<string, NormalizedPrincipal>, config: AccessConfig): NormalizedPrincipal {
  const snapshot = entry.snapshot!;
  const known = identities.get(entry.principal.id) ?? {
    ...clientPrincipal(entry.principal.clientId ?? '', entry.principal.name),
    id: entry.principal.id,
    kind: entry.principal.kind as NormalizedPrincipal['kind'],
  };
  // The snapshot keeps only whether an e-mail grant matched, so the grant supplies the address.
  const address = config.grants.find(grant => snapshot.grants.includes(grant.id) && grant.member.kind === 'email')?.member;
  const verifiedEmail = snapshot.emailMatched && address?.kind === 'email' ? address.email : null;
  return { ...known, groups: snapshot.groups, verifiedEmail };
}

function replayDecisions(scopeFor: (identity: NormalizedPrincipal) => ScopePair, audit: AuditEntry[], identities: Map<string, NormalizedPrincipal>, config: AccessConfig) {
  const changed: ChangedDecision[] = [];
  function compareDecision(label: string, identity: NormalizedPrincipal, action: Action, resource: ResourceRef) {
    const previous = scopeFor(identity).before.authorize(action, resource);
    const proposed = scopeFor(identity).after.authorize(action, resource);
    if (previous.allow === proposed.allow) return;
    changed.push({
      case: label,
      before: previous.allow,
      after: proposed.allow,
      // Cedar diagnostics can vary in order. Sort a copy by policy ID for a stable report.
      rules: [...proposed.rules].sort(),
    });
  }
  let matrixCases = 0;
  for (const identity of matrix.principals as NormalizedPrincipal[]) {
    for (const entry of matrix.cases) {
      if (!isAction(entry.action)) continue;
      compareDecision(`${identity.id}:${entry.case}`, identity, entry.action, entry.resource as ResourceRef);
      matrixCases++;
    }
  }
  const snapshots = sampleReplayEntries(audit);
  for (const entry of snapshots) {
    const identity = snapshotIdentity(entry, identities, config);
    const resource = entry.snapshot!.resourceAttrs as ResourceRef;
    compareDecision(entry.requestId, identity, entry.action as Action, resource);
  }
  return { changed, matrixCases, auditCases: snapshots.length };
}

/** Sample files that every role condition of either configuration tells apart. */
export function projectResources(project: string, before: AccessConfig, after: AccessConfig) {
  const example = { name: 'Example', status: 'proposed' };
  const resources: ResourceRef[] = [{ type: 'file', project, path: 'example.yaml', metric: example }];
  const permissions = [...before.roles, ...after.roles].flatMap(role => role.permissions);
  for (const { conditions } of permissions) {
    if (!conditions) continue;
    const path = conditions.path?.replace(/\*+/g, 'example') ?? 'example.yaml';
    for (const docType of conditions.docType ?? ['']) {
      const metric = docType === 'metric' ? { metric: example } : {};
      resources.push({
        type: 'file',
        project,
        path,
        docType,
        level: conditions.maxLevel,
        ...metric,
      });
    }
  }
  return resources;
}

/** Actions a role grants only on some files, which a project-level decision cannot show. */
function conditionalActions(pair: ScopePair, before: AccessConfig, after: AccessConfig) {
  const grants = [...pair.before.principal.grants, ...pair.after.principal.grants];
  const roleIds = new Set(grants.map(grant => grant.roleId));
  const roles = [...before.roles, ...after.roles].filter(role => roleIds.has(role.id));
  const actions = roles.flatMap(role => role.permissions.filter(permission => permission.conditions).flatMap(permission => permission.actions));
  return { hasGrants: grants.length > 0, actions: new Set(actions) };
}

function allowedActions(scope: RequestScope, project: string, files: ResourceRef[], conditional: ReturnType<typeof conditionalActions>): Action[] {
  const resource: ResourceRef = { type: 'project', project };
  return ACTIONS.filter(action => {
    if (scope.authorize(action, resource).allow) return true;
    if (!FILE_ACTIONS.includes(action) || !conditional.hasGrants) return false;
    // Metric approval depends on the file's owner, so it is checked on a sample file too.
    if (action !== 'approveMetric' && !conditional.actions.has(action)) return false;
    return files.some(target => scope.authorize(action, target).allow);
  });
}

function projectChange(identity: NormalizedPrincipal & { displayName: string }, project: string, oldActions: Action[], newActions: Action[]): AccessChange | null {
  const gained = newActions.filter(action => !oldActions.includes(action));
  const lost = oldActions.filter(action => !newActions.includes(action));
  if (!gained.length && !lost.length) return null;
  const read = identity.kind === 'client' ? 'agentRead' : 'read';
  let access: AccessChange['access'] = 'kept';
  if (!oldActions.includes(read) && newActions.includes(read)) access = 'gained';
  if (oldActions.includes(read) && !newActions.includes(read)) access = 'lost';
  return { principal: identity.id, name: identity.displayName, project, gained, lost, access };
}

/** "What changes for whom": every known person and client, per project, before and after. */
function peopleChanges(
  scopeFor: (identity: NormalizedPrincipal) => ScopePair,
  identities: NormalizedPrincipal[],
  projects: string[],
  configs: { before: AccessConfig; after: AccessConfig; names: Map<string, string> },
) {
  const people: AccessChange[] = [];
  for (const known of identities) {
    const identity = { ...known, displayName: configs.names.get(known.id) ?? known.id };
    const pair = scopeFor(known);
    const conditional = conditionalActions(pair, configs.before, configs.after);
    for (const project of projects) {
      const files = projectResources(project, configs.before, configs.after);
      const oldActions = allowedActions(pair.before, project, files, conditional);
      const newActions = allowedActions(pair.after, project, files, conditional);
      const change = projectChange(identity, project, oldActions, newActions);
      if (change) people.push(change);
    }
  }
  return people;
}

/** Who a dry run compares and what it replays. */
export interface DryRunEvidence {
  users: NormalizedPrincipal[];
  audit: AuditEntry[];
  /** Display names the panel shows, by identity; unknown identities keep their id. */
  names?: Map<string, string>;
  /** The active boundary, when comparison starts at the Admin service. */
  access?: AccessControl;
}

/** Replays matrix and audit cases and compares every known person's and client's project actions. */
export function compareAccess(options: AccessOptions, next: AccessConfig, { users, audit, names = new Map(), access }: DryRunEvidence) {
  const before = access ?? createAccessControl(options);
  const { snapshot: current, scopeFor } = scopeCache(before, next);
  const identities = new Map(users.map(user => [user.id, user]));
  for (const client of [...current.config.agents.clients, ...next.agents.clients]) {
    identities.set(`client:${client.clientId}`, clientPrincipal(client.clientId, client.name));
  }
  const projects = [...new Set([...current.knownProjects(), ...Object.keys(next.projects.projects)])];
  const replayed = replayDecisions(scopeFor, audit, identities, current.config);
  const configs = { before: current.config, after: next, names };
  const people = peopleChanges(scopeFor, [...identities.values()], projects, configs);
  return { ...replayed, people };
}
