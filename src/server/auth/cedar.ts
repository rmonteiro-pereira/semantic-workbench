// Owns the Cedar engine, validated policy loading, and the entity graph used for decisions.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { compileRoles } from './role-compiler';
import { holdersOfGrant, type GrantOptions } from './grants';
import { levelNumber, type Action } from './actions';
import { matchesSegmentGlob } from './path-rules';
import type { AccessConfig, Role } from './access-config';
import type { Principal } from './principal';
import { NEW_PROJECT, type ResourceRef, type DecisionContext } from './resource';
import { validateAccessDocument } from './access-config';

/** Policy parsing or validation failure that must never replace the active policy set. */
export class PolicyLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyLoadError';
  }
}

/** Compiled policy handles and rule metadata for one loaded configuration. */
export type PolicySet = ReturnType<typeof preparePolicies>;

function baselinePolicies(): Record<string, string> {
  const source = readFileSync(new URL('../../../policies/baseline.cedar', import.meta.url), 'utf8');
  const parts = cedar.policySetTextToParts(source);
  if (parts.type === 'failure') throw new PolicyLoadError(JSON.stringify(parts.errors));
  const policies: Record<string, string> = {};
  for (const text of parts.policies) {
    const id = /@id\("([^"\n]+)"\)/.exec(text)?.[1];
    if (!id || policies[id]) throw new PolicyLoadError('Baseline policy ids must be unique.');
    policies[id] = text;
  }
  return policies;
}

function preparePolicies(options: {
  builtinRoles: Role[];
  customRoles: Role[];
  adminRules?: Record<string, string>;
}) {
  validateAccessDocument('builtinRolesFile', { formatVersion: 1, roles: options.builtinRoles });
  const roles = [...options.builtinRoles, ...options.customRoles];
  const compiled = compileRoles(roles);
  const staticPolicies = { ...baselinePolicies(), ...compiled.policies };
  for (const [id, text] of Object.entries(options.adminRules ?? {})) {
    if (staticPolicies[id]) throw new PolicyLoadError(`Duplicate policy id: ${id}`);
    if (!/@enabled\("false"\)/.test(text)) staticPolicies[id] = text;
  }
  const schema =
    readFileSync(new URL('../../../policies/schema.cedarschema', import.meta.url), 'utf8') +
    '\n' +
    compiled.holdersFragment;
  const policies = { staticPolicies };
  const validation = cedar.validate({ schema, policies });
  if (validation.type === 'failure') throw new PolicyLoadError(JSON.stringify(validation.errors));
  if (validation.validationErrors.length) {
    throw new PolicyLoadError(JSON.stringify(validation.validationErrors));
  }
  const preparsedSchemaName = `schema:${randomUUID()}`;
  const preparsedPolicySetId = `policies:${randomUUID()}`;
  for (const parsed of [
    cedar.preparseSchema(preparsedSchemaName, schema),
    cedar.preparsePolicySet(preparsedPolicySetId, policies),
  ]) {
    if (parsed.type === 'failure') throw new PolicyLoadError(JSON.stringify(parsed.errors));
  }
  const forbids = new Set(
    Object.entries(staticPolicies)
      .filter(([, text]) => /\bforbid\s*\(/.test(text))
      .map(([id]) => id),
  );
  return {
    preparsedSchemaName,
    preparsedPolicySetId,
    pathGlobs: compiled.pathGlobs,
    roles,
    forbids,
    // Arbitrary rules can inspect resource ids or paths beyond the compiler's rule classes.
    exactResources: Object.keys(options.adminRules ?? {}).length > 0,
  };
}

/** Loads and validates a complete policy set before exposing its prepared handles. */
export function loadPolicySet(options: {
  builtinRoles: Role[];
  customRoles: Role[];
  adminRules?: Record<string, string>;
}): PolicySet {
  try {
    return preparePolicies(options);
  } catch (error) {
    if (error instanceof PolicyLoadError) throw error;
    throw new PolicyLoadError(error instanceof Error ? error.message : String(error));
  }
}

function uid(type: string, id: string): cedar.TypeAndId {
  return { type: `SW::${type}`, id };
}
function reference(type: string, id: string): cedar.CedarValueJson {
  return { __entity: uid(type, id) };
}
function entity(
  type: string,
  id: string,
  attrs: cedar.EntityJson['attrs'] = {},
  parents: cedar.TypeAndId[] = [],
): cedar.EntityJson {
  return { uid: uid(type, id), attrs, parents };
}

type EntityOptions = {
  config: AccessConfig;
  roles: Role[];
  projects: string[];
  groupMatch: GrantOptions['groupMatch'];
};

/** A project and the domain whose grants reach it. */
type ProjectDomain = { slug: string; domain: string | null };

function knownProjectDomains(options: EntityOptions): ProjectDomain[] {
  return options.projects.map(slug => ({
    slug,
    domain: options.config.projects.projects[slug]?.domain ?? null,
  }));
}

/**
 * The project a creation request asks for, before it exists. Its domain comes from the request,
 * so domain-scoped grants apply to it exactly as they will once the project is created. Only the
 * reserved new-project name borrows a domain this way; a real slug never does.
 */
function prospectiveProject(resource: ResourceRef): ProjectDomain | null {
  if (resource.type === 'workspace' || resource.project !== NEW_PROJECT) return null;
  if (resource.domain === undefined) return null;
  return { slug: resource.project, domain: resource.domain };
}

function memberEntities(options: EntityOptions, projects: ProjectDomain[]): cedar.EntityJson[] {
  const members = new Map<string, cedar.EntityJson>();
  const normalize = (group: string) =>
    options.groupMatch === 'exact' ? group : group.toLowerCase();
  const add = (type: string, id: string, parents: cedar.TypeAndId[]) => {
    const key = `${type}:${id}`;
    const member = members.get(key) ?? entity(type, id, type === 'Group' ? { name: id } : {});
    member.parents.push(...parents);
    members.set(key, member);
  };
  for (const grant of options.config.grants) {
    const parents = holdersOfGrant(grant, projects).map(id => uid('RoleHolder', id));
    if (grant.member.kind === 'group') add('Group', normalize(grant.member.groupId), parents);
    else add('Email', grant.member.email.toLowerCase(), parents);
  }
  return [...members.values()];
}

function accessSets(principal: Principal, options: EntityOptions): cedar.CedarValueJson[] {
  const normalize = (group: string) =>
    options.groupMatch === 'exact' ? group : group.toLowerCase();
  const groups = new Set(
    principal.groupsResolved === 'failed' ? [] : principal.groups.map(normalize),
  );
  const email = principal.verifiedEmail?.toLowerCase();
  return Object.entries(options.config.projects.projects).flatMap(([slug, project]) =>
    project.restricted.flatMap((rule, index) => {
      const matches =
        rule.groups.some(group => groups.has(normalize(group))) ||
        rule.emails.some(address => email !== undefined && address.toLowerCase() === email);
      return matches ? [reference('AccessSet', `${slug}#${index}`)] : [];
    }),
  );
}

function principalEntity(principal: Principal, options: EntityOptions): cedar.EntityJson {
  if (principal.kind === 'client') {
    const client = options.config.agents.clients.find(
      client => client.clientId === principal.clientId,
    );
    const projects = options.projects.filter(
      slug =>
        client?.projects.includes(slug) ||
        client?.domains.includes(options.config.projects.projects[slug]?.domain ?? ''),
    );
    return entity('Client', principal.id, {
      id: principal.id,
      clientId: principal.clientId ?? '',
      projects: principal.deactivated ? [] : projects,
    });
  }
  const groups = principal.groupsResolved === 'failed' ? [] : principal.groups;
  const parents = groups.map(group =>
    uid('Group', options.groupMatch === 'exact' ? group : group.toLowerCase()),
  );
  if (principal.verifiedEmail) parents.push(uid('Email', principal.verifiedEmail.toLowerCase()));
  if (principal.grants.some(grant => grant.via === 'bootstrap' || grant.via === 'local')) {
    parents.push(uid('RoleHolder', 'admin@workspace'));
  }
  return entity(
    'User',
    principal.id,
    {
      id: principal.id,
      kind: principal.kind,
      email: principal.verifiedEmail?.toLowerCase() ?? '',
      username: principal.username.toLowerCase(),
      deactivated: principal.deactivated,
      hasAccess: principal.grants.length > 0,
      accessSets: accessSets(principal, options),
    },
    parents,
  );
}

function resourceEntity(resource: ResourceRef, options: EntityOptions): cedar.EntityJson {
  const slug = resource.type === 'workspace' ? '' : resource.project;
  const project = options.config.projects.projects[slug];
  const domain = project?.domain ?? prospectiveProject(resource)?.domain ?? '';
  const file = resource.type === 'file' ? resource : undefined;
  const path = file?.path ?? '';
  const restrictedTo = (project?.restricted ?? []).flatMap((rule, index) =>
    file && matchesSegmentGlob(path, rule.pattern)
      ? [reference('AccessSet', `${slug}#${index}`)]
      : [],
  );
  const holders = Object.fromEntries(
    options.roles
      .filter(role => role.id !== 'admin')
      .map(role => [role.id, reference('RoleHolder', `${role.id}@${slug || 'workspace'}`)]),
  );
  const attrs: cedar.EntityJson['attrs'] = {
    project: slug,
    domain,
    hasDomain: resource.type === 'workspace' || Boolean(domain),
    everyoneCanRead: project?.everyoneCanRead ?? false,
    holders,
    explicitHolders: reference('RoleHolder', `explicit@${slug}`),
    path,
    docType: file?.metric ? 'metric' : (file?.docType ?? ''),
    level: levelNumber(file?.level ?? 'public'),
    restricted: restrictedTo.length > 0,
    restrictedTo,
    status: file?.metric?.status ?? '',
    owner: file?.metric?.owner?.toLowerCase() ?? '',
    protectedLevel: levelNumber(
      project?.protectedLevel ?? options.config.projects.classification.protectedLevel,
    ),
  };
  if (resource.type === 'workspace') return entity('Workspace', 'ws', attrs);
  if (!file) return entity('Project', slug, attrs);
  const id = `${slug}/${path}`;
  const parents = [uid('Project', slug)];
  if (file.metric) return entity('Metric', `${id}#${file.metric.name}`, attrs, parents);
  return entity('File', id, attrs, parents);
}

/** Builds a reusable membership graph and evaluates requests through prepared Cedar policies. */
export function createPolicyEvaluator(policy: PolicySet, options: EntityOptions) {
  const known = knownProjectDomains(options);
  const members = memberEntities(options, known);
  return (
    principal: Principal,
    action: Action,
    resource: ResourceRef,
    context: DecisionContext,
  ) => {
    const person = principalEntity(principal, options);
    const target = resourceEntity(resource, options);
    const prospective = prospectiveProject(resource);
    // Only a project that does not exist yet needs its role holders added for this one question.
    const graph = prospective ? memberEntities(options, [...known, prospective]) : members;
    const entities = [...graph, person, target];
    if (resource.type === 'file') {
      const project = { type: 'project' as const, project: resource.project };
      // A file of a project being created belongs to the domain the creation names.
      const domain = resource.domain === undefined ? {} : { domain: resource.domain };
      entities.push(resourceEntity({ ...project, ...domain }, options));
    }
    try {
      const result = cedar.statefulIsAuthorized({
        principal: person.uid,
        action: uid('Action', action),
        resource: target.uid,
        context: {
          hour: -1,
          ...context,
          sourceIp: { __extn: { fn: 'ip', arg: context.sourceIp ?? '0.0.0.0' } },
        },
        entities,
        validateRequest: false,
        preparsedSchemaName: policy.preparsedSchemaName,
        preparsedPolicySetId: policy.preparsedPolicySetId,
      });
      if (result.type === 'failure') return { allow: false, rules: [], reason: 'evaluation-error' };
      const { diagnostics, decision } = result.response;
      if (diagnostics.errors.length) {
        return { allow: false, rules: diagnostics.reason, reason: 'evaluation-error' };
      }
      return {
        allow: decision === 'allow',
        rules: diagnostics.reason,
        reason: diagnostics.reason.find(id => policy.forbids.has(id)) ?? 'no-permit',
      };
    } catch {
      return { allow: false, rules: [], reason: 'evaluation-error' };
    }
  };
}
