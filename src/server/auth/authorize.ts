// The access-decision boundary combines validated configuration with Cedar.
// Request caches share decisions only for resources no compiled condition can distinguish.
import {
  NEW_PROJECT,
  newProjectIn,
  normalizeResource,
  type ResourceRef,
  type Decision,
  type DecisionContext,
} from './resource';
import builtin from '../../../policies/builtin-roles.json';
import { loadPolicySet, createPolicyEvaluator, PolicyLoadError } from './cedar';
import { validateAccessConfig, type AccessConfig, type Role } from './access-config';
import { holdersOfGrant, resolveGrants, type Bootstrap, type GrantOptions } from './grants';
import {
  clientPrincipal,
  localPrincipal,
  type NormalizedPrincipal,
  type Principal,
} from './principal';
import { ACTIONS, levelNumber, type Action } from '../../shared/auth/actions';
import { matchesSegmentGlob, matchesCedarLike } from './path-rules';
import type { ClassificationSettings } from './guards';

/** Configuration accepted by the access boundary. */
export type { AccessConfig } from './access-config';
/** Resource and decision types shared with policy callers. */
export type { ResourceRef, Decision, DecisionContext } from './resource';
/** A person's readable project listing and per-project access details. */
export type AccessView = {
  readableProjects: Set<string>;
  canRead(project: string, path: string): boolean;
  roles(project: string): string[];
};
/** Runtime settings and validated-document input for an access boundary. */
export type AccessOptions = {
  mode: 'local' | 'server';
  config: AccessConfig;
  bootstrap: Bootstrap;
  groupMatch: GrantOptions['groupMatch'];
  knownProjects: () => string[];
  context?: () => Pick<DecisionContext, 'hour' | 'sourceIp'>;
};

function prepare(config: AccessConfig, projects: string[], groupMatch: GrantOptions['groupMatch']) {
  projects = [...projects];
  try {
    const validated = validateAccessConfig(config);
    const policy = loadPolicySet({
      builtinRoles: builtin.roles as Role[],
      customRoles: validated.roles,
      adminRules: validated.adminRules,
    });
    const evaluate = createPolicyEvaluator(policy, {
      config: validated,
      projects,
      groupMatch,
      roles: policy.roles,
    });
    return { config: validated, policy, evaluate, projects };
  } catch (error) {
    if (error instanceof PolicyLoadError) throw error;
    throw new PolicyLoadError(error instanceof Error ? error.message : String(error));
  }
}
type ActiveAccess = ReturnType<typeof prepare>;

function requestContext(
  active: ActiveAccess,
  mode: AccessOptions['mode'],
  resource: ResourceRef,
  supplied: Partial<DecisionContext>,
): DecisionContext {
  const branch = supplied.branch ?? '';
  const project =
    resource.type === 'workspace' ? undefined : active.config.projects.projects[resource.project];
  return {
    mode,
    hour: supplied.hour ?? -1,
    sourceIp: supplied.sourceIp ?? '0.0.0.0',
    branch,
    protectedBranch:
      Boolean(supplied.protectedBranch) ||
      Boolean(project?.protectedBranches.some(pattern => matchesSegmentGlob(branch, pattern))),
    level:
      supplied.level ??
      levelNumber(resource.type === 'file' ? (resource.level ?? 'public') : 'public'),
    guardKind: supplied.guardKind ?? '',
  };
}

function ruleClass(active: ActiveAccess, resource: ResourceRef): unknown[] {
  if (resource.type !== 'file') return [resource.type];
  const rules = active.config.projects.projects[resource.project]?.restricted ?? [];
  const restricted = rules.flatMap((rule, index) =>
    matchesSegmentGlob(resource.path, rule.pattern) ? [index] : [],
  );
  const paths = active.policy.pathGlobs.flatMap((glob, index) =>
    matchesCedarLike(resource.path, glob) ? [index] : [],
  );
  return [
    resource.metric ? 'metric' : 'file',
    restricted,
    paths,
    resource.docType ?? '',
    resource.level ?? 'public',
    resource.metric?.status ?? '',
    resource.metric?.owner?.toLowerCase() ?? '',
    active.policy.exactResources ? resource.path : '',
    active.policy.exactResources ? (resource.metric?.name ?? '') : '',
  ];
}

/** One question put to the policies: who wants to do what on which resource, and in what context. */
type DecisionRequest = {
  principal: Principal;
  action: Action;
  resource: ResourceRef;
  context: DecisionContext;
};

function decisionFor(active: ActiveAccess, request: DecisionRequest): Decision {
  const { principal, action, resource, context } = request;
  const result = active.evaluate(principal, action, resource, context);
  if (result.allow) return { allow: true, rules: result.rules, status: 200 };
  if (resource.type !== 'workspace') {
    const readable =
      action !== 'read' && active.evaluate(principal, 'read', resource, context).allow;
    if (!readable)
      return { allow: false, rules: result.rules, status: 404, reason: 'not-readable' };
  }
  return { allow: false, rules: result.rules, status: 403, reason: result.reason };
}

/**
 * Decides whether a person may create a project. A request naming a domain is judged as the new
 * project in that domain. A request without one passes when some configured domain would allow it.
 */
function creationDecision(
  active: ActiveAccess,
  principal: Principal,
  resource: ResourceRef,
  supplied: Partial<DecisionContext>,
): Decision {
  if (resource.type === 'project') return newProjectDecision(active, principal, resource, supplied);
  const decision = decisionFor(active, {
    principal,
    action: 'createProject',
    resource,
    context: requestContext(active, 'server', resource, supplied),
  });
  if (decision.allow) return decision;
  for (const domain of active.config.projects.domains) {
    const candidate = newProjectDecision(active, principal, newProjectIn(domain.id), supplied);
    if (candidate.allow) return candidate;
  }
  return decision;
}

function newProjectDecision(
  active: ActiveAccess,
  principal: Principal,
  resource: Extract<ResourceRef, { type: 'project' }>,
  supplied: Partial<DecisionContext>,
): Decision {
  // A domain that does not exist answers like one the person cannot see, so the status never
  // tells which domains exist.
  if (!active.config.projects.domains.some(domain => domain.id === resource.domain)) {
    return { allow: false, status: 404, rules: [], reason: 'not-readable' };
  }
  return decisionFor(active, {
    principal,
    action: 'createProject',
    resource,
    context: requestContext(active, 'server', resource, supplied),
  });
}

/** Creates the only authority for access decisions, filtered listings, and principal grants. */
export function createAccessControl(options: AccessOptions) {
  const bootstrap = structuredClone(options.bootstrap);
  const listeners = new Set<() => void>();
  let active = prepare(options.config, options.knownProjects(), options.groupMatch);
  function refreshProjects(): void {
    const projects = [...options.knownProjects()].sort();
    if (JSON.stringify(projects) === JSON.stringify([...active.projects].sort())) return;
    active = {
      ...active,
      projects,
      evaluate: createPolicyEvaluator(active.policy, {
        config: active.config,
        projects,
        groupMatch: options.groupMatch,
        roles: active.policy.roles,
      }),
    };
  }

  function principalFor(normalized: NormalizedPrincipal & { deactivated?: boolean }): Principal {
    if (normalized.kind === 'local' && options.mode === 'local') {
      return { ...localPrincipal(), deactivated: Boolean(normalized.deactivated) };
    }
    const deactivated = active.config.deactivated.principals.map(principal => principal.id);
    const isDeactivated = Boolean(normalized.deactivated) || deactivated.includes(normalized.id);
    // Agent clients: people's grants never apply to one, even a bootstrap id naming it. The
    // policies decide it from its agents.json entry: B8-agent permits agentRead on its projects,
    // F4-bearer-scope forbids every other action and F6-restricted hides restricted files, so
    // accessView lists what agentRead allows. The entry's name is shown and audited for it.
    if (normalized.kind === 'client') {
      const entry = active.config.agents.clients.find(
        client => client.clientId === normalized.clientId,
      );
      const name = entry?.name ?? normalized.name;
      return { ...normalized, name, deactivated: isDeactivated, grants: [] };
    }
    return {
      ...normalized,
      deactivated: isDeactivated,
      grants: resolveGrants(normalized, active.config.grants, {
        bootstrap,
        deactivated,
        groupMatch: options.groupMatch,
      }),
    };
  }

  function forRequest(identity: Principal, requestDefaults: Partial<DecisionContext> = {}) {
    refreshProjects();
    let snapshot = active;
    let principal = principalFor(identity);
    const decisions = new Map<string, Decision>();

    function synchronize(): void {
      refreshProjects();
      if (snapshot === active) return;
      snapshot = active;
      principal = principalFor(identity);
      decisions.clear();
    }

    function authorize(
      action: Action,
      input: ResourceRef,
      supplied: Partial<DecisionContext> = {},
    ): Decision {
      synchronize();
      const resource = normalizeResource(input);
      const context = requestContext(snapshot, options.mode, resource, {
        ...options.context?.(),
        ...requestDefaults,
        ...supplied,
      });
      const project = resource.type === 'workspace' ? '' : resource.project;
      const key = JSON.stringify([
        action,
        project,
        ruleClass(snapshot, resource),
        context,
        resource.type === 'workspace' ? undefined : resource.domain,
      ]);
      const previous = decisions.get(key);
      if (previous) return previous;
      if (
        action === 'createProject' &&
        options.mode === 'server' &&
        (resource.type === 'workspace' ||
          (resource.type === 'project' && resource.project === NEW_PROJECT))
      ) {
        const decision = creationDecision(snapshot, principal, resource, supplied);
        decisions.set(key, decision);
        return decision;
      }
      const decision = decisionFor(snapshot, { principal, action, resource, context });
      decisions.set(key, decision);
      return decision;
    }

    function filter<T>(action: Action, items: T[], toResource: (item: T) => ResourceRef): T[] {
      return items.filter(item => authorize(action, toResource(item)).allow);
    }

    function view(): AccessView {
      synchronize();
      return accessView(snapshot, principal, authorize);
    }

    return {
      get principal() {
        synchronize();
        return principal;
      },
      authorize,
      /** The custom roles of the policy this scope decides with. */
      customRoles: () => {
        synchronize();
        return snapshot.config.roles;
      },
      /** How the project's classification values map to levels, and its protected level. */
      classification: (project: string): ClassificationSettings => {
        synchronize();
        const { projects, classification } = snapshot.config.projects;
        return {
          aliases: classification.aliases,
          protectedLevel: projects[project]?.protectedLevel ?? classification.protectedLevel,
        };
      },
      creationDomains: () => {
        synchronize();
        return snapshot.config.projects.domains.filter(
          domain => authorize('createProject', newProjectIn(domain.id)).allow,
        );
      },
      filter,
      view,
    };
  }

  function authorize(
    principal: Principal,
    action: Action,
    resource: ResourceRef,
    context: Partial<DecisionContext> = {},
  ): Decision {
    return forRequest(principal).authorize(action, resource, context);
  }

  function filter<T>(
    principal: Principal,
    action: Action,
    items: T[],
    toResource: (item: T) => ResourceRef,
  ): T[] {
    return forRequest(principal).filter(action, items, toResource);
  }

  function reload(config: AccessConfig): void {
    active = prepare(config, options.knownProjects(), options.groupMatch);
    for (const listener of listeners) listener();
  }
  const view = (principal: Principal) => forRequest(principal).view();
  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
  function explain(
    identity: NormalizedPrincipal,
    action: Action,
    resource: ResourceRef,
    context: Partial<DecisionContext> = {},
  ) {
    const principal = principalFor(identity);
    const decision = authorize(principal, action, resource, context);
    return {
      decision,
      grants: principal.grants,
      roles: [...new Set(principal.grants.map(grant => grant.roleId))],
      rules: decision.rules,
      attributes: {
        principal,
        resource,
        context: requestContext(active, options.mode, resource, {
          ...options.context?.(),
          ...context,
        }),
      },
    };
  }
  function whoCan(resource: ResourceRef, users: NormalizedPrincipal[]) {
    const candidates = users.map(principal => ({ principal: principal.id, identity: principal }));
    const members = active.config.grants.map(grant => {
      const member = grant.member;
      const identity = hypotheticalPrincipal(
        member.kind === 'group' ? [member.groupId] : [],
        member.kind === 'email' ? member.email : null,
      );
      return {
        ...(member.kind === 'group' ? { group: member.groupId } : { email: member.email }),
        via: grant.id,
        identity,
      };
    });
    const clients = active.config.agents.clients.map(client => ({
      client: client.clientId,
      identity: clientPrincipal(client.clientId, client.name),
    }));
    return [...candidates, ...members, ...clients].flatMap(({ identity, ...label }) => {
      const principal = principalFor(identity);
      const actions = ACTIONS.filter(action => authorize(principal, action, resource).allow);
      return actions.length ? [{ ...label, actions }] : [];
    });
  }
  const snapshot = (): AccessOptions => ({
    ...options,
    bootstrap: structuredClone(bootstrap),
    config: structuredClone(active.config),
  });
  return {
    forRequest,
    authorize,
    filter,
    view,
    reload,
    principalFor,
    subscribe,
    explain,
    whoCan,
    snapshot,
  };
}
/** The access boundary instance shared across requests. */
export type AccessControl = ReturnType<typeof createAccessControl>;
/** One principal's decisions and readable view, resolved once per request or event stream. */
export type AccessScope = ReturnType<AccessControl['forRequest']>;

function accessView(
  active: ActiveAccess,
  principal: Principal,
  authorize: (action: Action, resource: ResourceRef) => Decision,
): AccessView {
  const projects = active.projects.map(slug => ({
    slug,
    domain: active.config.projects.projects[slug]?.domain ?? null,
  }));
  const grants = principal.grants;
  const readAction = principal.kind === 'client' ? 'agentRead' : 'read';
  return {
    readableProjects: new Set(
      active.projects.filter(project => authorize(readAction, { type: 'project', project }).allow),
    ),
    canRead: (project, path) => authorize(readAction, { type: 'file', project, path }).allow,
    roles: project => [
      ...new Set(
        grants
          .filter(grant => {
            const holders = holdersOfGrant(grant, projects);
            return (
              holders.includes('admin@workspace') || holders.includes(`${grant.roleId}@${project}`)
            );
          })
          .map(grant => grant.roleId),
      ),
    ],
  };
}

/** Builds an explicitly hypothetical identity for the administrator's simulator. */
export function hypotheticalPrincipal(groups: string[], email: string | null): NormalizedPrincipal {
  return {
    id: 'hypothetical',
    key: 'hypothetical',
    kind: 'person',
    name: 'Hypothetical',
    username: '',
    verifiedEmail: email?.trim().toLowerCase() ?? null,
    groups,
    groupsResolved: 'token',
    groupOverage: false,
  };
}
