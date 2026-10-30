// Parses administrative requests and delegates all saves to the versioned access service.
import type { Route } from './http';
import { decodeSegment, readJson, requestAuditId, type AuditRequest } from '../request';
import type { HandlerOptions } from '../auth/middleware';
import { requestScope } from '../auth/request-scope';
import { AdminConfigError, withSettingsDefaults } from '../auth/admin-repo';
import { hypotheticalPrincipal } from '../auth/authorize';
import { isAction, ACTIONS, LEVELS, type Level } from '../../shared/auth/actions';
import { roleSource } from '../auth/grants';
import { validatePolicies, listPolicies, policyTemplate, policyTemplateFrom } from '../auth/policies';
import type { AccessAdmin, AdminActor } from '../auth/access-admin';
import type { AccessConfig } from '../auth/access-config';
import { clientPrincipal, type NormalizedPrincipal } from '../auth/principal';
import type { GroupName } from '../auth/directory';
import type { ProviderStatus } from '../auth/oidc';
import type { ResourceRef } from '../auth/resource';
import builtin from '../../../policies/builtin-roles.json';

/** A file resource with every attribute the simulator accepts. */
type FileResource = Extract<ResourceRef, { type: 'file' }>;
/** Everything one administration request needs, resolved once by the router. */
type AdminRequest = {
  service: AccessAdmin;
  request: Request;
  url: URL;
  path: string;
  options: HandlerOptions;
};

const DOCUMENT_AREAS = ['grants', 'projects', 'agents', 'settings'];
const SAVE_AREAS = ['roles', 'grants', 'projects', 'agents', 'settings', 'policies'];
const ROLE_CONDITIONS = ['branch', 'path', 'docType', 'maxLevel'];
const LOCAL_PROVIDER: ProviderStatus = {
  issuer: null,
  clientId: null,
  discovery: 'unavailable',
  groupClaimMode: 'none',
  overage: 'off',
  jwksRefreshedAt: null,
};

async function objectBody(request: Request): Promise<Record<string, unknown>> {
  const body = await readJson(request, 1_000_000);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AdminConfigError('Expected a JSON object.');
  }
  return body;
}
function actorOf(request: Request): AdminActor {
  const requestId = (request as AuditRequest)[requestAuditId]!;
  return { principal: requestScope(request).principal, requestId };
}

function metricFrom(input: unknown): NonNullable<FileResource['metric']> {
  const metric = input as Record<string, unknown> | null;
  const valid =
    metric !== null && typeof metric === 'object' && typeof metric.name === 'string' && typeof metric.status === 'string' && (metric.owner === undefined || typeof metric.owner === 'string');
  if (!valid) throw new AdminConfigError('Expected metric name, status and optional owner.');
  return {
    name: metric.name as string,
    status: metric.status as string,
    owner: metric.owner as string | undefined,
  };
}
function fileResourceFrom(resource: Record<string, unknown>, project: string): ResourceRef {
  if (typeof resource.path !== 'string') throw new AdminConfigError('Invalid resource.');
  const target: FileResource = { type: 'file', project, path: resource.path };
  if (resource.docType !== undefined) {
    if (typeof resource.docType !== 'string') throw new AdminConfigError('Invalid document type.');
    target.docType = resource.docType;
  }
  if (resource.level !== undefined) {
    if (!LEVELS.includes(resource.level as Level)) throw new AdminConfigError('Invalid level.');
    target.level = resource.level as Level;
  }
  if (resource.metric !== undefined) target.metric = metricFrom(resource.metric);
  return target;
}
function resourceFrom(input: unknown): ResourceRef {
  if (!input || typeof input !== 'object') throw new AdminConfigError('Expected resource.');
  const resource = input as Record<string, unknown>;
  if (resource.type === 'workspace') return { type: 'workspace' };
  if (typeof resource.project !== 'string' || !resource.project) throw new AdminConfigError('Expected project.');
  if (resource.type === 'project') return { type: 'project', project: resource.project };
  if (resource.type !== 'file') throw new AdminConfigError('Invalid resource.');
  return fileResourceFrom(resource, resource.project);
}

/** A described principal has groups and an optional address; a string names a known one. */
function checkedPrincipal(service: AccessAdmin, input: unknown): NormalizedPrincipal {
  if (typeof input === 'string') {
    const client = service.repository.load().agents.clients.find(candidate => `client:${candidate.clientId}` === input);
    if (client) return clientPrincipal(client.clientId, client.name);
    const user = service.users().find(candidate => candidate.id === input);
    if (user) return user;
    throw new AdminConfigError('Unknown principal.');
  }
  const described = input as Record<string, unknown> | null;
  const email = described?.email ?? null;
  const valid =
    described !== null &&
    typeof described === 'object' &&
    Array.isArray(described.groups) &&
    described.groups.every(group => typeof group === 'string') &&
    (email === null || typeof email === 'string');
  if (!valid) throw new AdminConfigError('Expected groups and optional email.');
  return hypotheticalPrincipal(described.groups as string[], email as string | null);
}
function accessCheck(service: AccessAdmin, body: Record<string, unknown>) {
  if (!isAction(body.action)) throw new AdminConfigError('Unknown action.');
  const identity = checkedPrincipal(service, body.principal);
  const resource = resourceFrom(body.resource);
  const branch = (body.resource as Record<string, unknown>).branch;
  if (branch !== undefined && typeof branch !== 'string') throw new AdminConfigError('Invalid branch.');
  return service.access.explain(identity, body.action, resource, {
    branch: branch as string | undefined,
  });
}

/** Names of every recorded person's groups, from the service's short-lived directory cache. */
function groupNames(service: AccessAdmin) {
  return service.groupNames(service.users().flatMap(user => user.groups));
}
function personRow(service: AccessAdmin, user: ReturnType<AccessAdmin['users']>[number], names: Map<string, GroupName>) {
  const principal = service.access.principalFor(user);
  const view = service.access.view(principal);
  const workspaceRoles = principal.grants.filter(grant => grant.scope.kind === 'workspace').map(grant => grant.roleId);
  const projectRoles = [...view.readableProjects].map(project => [project, view.roles(project)]);
  const hasAccess = principal.grants.length > 0 && !principal.deactivated;
  return {
    ...user,
    deactivated: principal.deactivated,
    roleSources: principal.grants.map(grant => roleSource(grant, grant.group ? names.get(grant.group)?.displayName : null)),
    bootstrap: principal.grants.some(grant => grant.via === 'bootstrap'),
    access: hasAccess ? 'granted' : 'none',
    roles: { workspace: workspaceRoles, projects: Object.fromEntries(projectRoles) },
  };
}
/** Agent clients are listed beside people; their access comes from agents.json, not grants. */
function clientRow(client: AccessConfig['agents']['clients'][number]) {
  const identity = clientPrincipal(client.clientId, client.name);
  const hasScope = client.projects.length > 0 || client.domains.length > 0;
  return {
    ...identity,
    lastSignInAt: null,
    projects: client.projects,
    domains: client.domains,
    deactivated: false,
    roleSources: [],
    bootstrap: false,
    access: hasScope ? 'granted' : 'none',
    roles: { workspace: [], projects: {} },
  };
}
function matchesSearch(row: Record<string, unknown>, groups: (GroupName | undefined)[], query: string) {
  const names = groups.map(group => group?.displayName ?? group?.id);
  const fields = [row.id, row.name, row.verifiedEmail, row.username, row.clientId, ...names];
  return fields.some(field => typeof field === 'string' && field.toLowerCase().includes(query));
}
async function userList(context: AdminRequest) {
  const { service, url } = context;
  const names = await groupNames(service);
  const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const onlyWithoutAccess = url.searchParams.get('access') === 'none';
  const people = service.users().map(user => {
    const groups = user.groups.map(id => names.get(id));
    return { row: { ...personRow(service, user, names), groups }, groups };
  });
  const clients = service.repository.load().agents.clients.map(client => ({ row: clientRow(client), groups: [] }));
  return [...people, ...clients]
    .filter(({ row, groups }) => !query || matchesSearch(row, groups, query))
    .filter(({ row }) => !onlyWithoutAccess || row.access === 'none')
    .map(({ row }) => row);
}

function rolesDocument(service: AccessAdmin, config: AccessConfig) {
  const allRoles = [...builtin.roles, ...config.roles];
  const users = service.users().map(user => service.access.principalFor(user));
  const usage = allRoles.map(role => {
    const grants = config.grants.filter(grant => grant.roleId === role.id).length;
    const people = users.filter(user => user.grants.some(grant => grant.roleId === role.id));
    return [role.id, { grants, people: people.length }];
  });
  return {
    builtIn: builtin.roles,
    custom: config.roles,
    actions: ACTIONS,
    conditions: ROLE_CONDITIONS,
    usage: Object.fromEntries(usage),
  };
}
async function versionedDocument({ service, path }: AdminRequest) {
  const snapshot = await service.repository.snapshot();
  const config = service.repository.validate(snapshot.files);
  const document = path === 'roles' ? rolesDocument(service, config) : listPolicies(config.adminRules, config.roles);
  return { ...document, version: snapshot.version };
}
/** Returns stored labels, preferring a directory's current name when available. */
async function storedDocument({ service, path }: AdminRequest) {
  const { files, version } = await service.repository.snapshot();
  const document = JSON.parse(files[path + '.json']);
  if (path === 'settings') return { ...withSettingsDefaults(document), version };
  if (path !== 'grants') return { ...document, version };
  const grants = document.grants as AccessConfig['grants'];
  const names = await service.groupNames(grants.flatMap(grant => (grant.member.kind === 'group' ? [grant.member.groupId] : [])));
  for (const grant of grants) {
    if (grant.member.kind !== 'group') continue;
    const name = names.get(grant.member.groupId);
    if (name?.resolved && name.displayName) grant.member.displayName = name.displayName;
  }
  return { ...document, version };
}
function whoCan({ service, url }: AdminRequest) {
  const project = url.searchParams.get('project');
  if (!project) throw new AdminConfigError('Expected project.');
  const file = url.searchParams.get('path');
  const resource: ResourceRef = file ? { type: 'file', project, path: file } : { type: 'project', project };
  return service.access.whoCan(resource, service.users());
}
function versions({ service, url }: AdminRequest) {
  const area = url.searchParams.get('area');
  if (!area) return service.repository.history();
  // Policies are a folder of rule files; every other area is one document.
  return service.repository.history(area === 'policies' ? 'policies' : area + '.json');
}

async function getResponse(context: AdminRequest): Promise<unknown> {
  const { service, path, url, options } = context;
  if (path === 'users') return userList(context);
  if (path === 'roles' || path === 'policies') return versionedDocument(context);
  if (DOCUMENT_AREAS.includes(path)) return storedDocument(context);
  if (path === 'versions') return versions(context);
  if (path === 'sessions') return (await options.authentication?.sessions.list()) ?? [];
  if (path === 'provider') return options.providerStatus ?? LOCAL_PROVIDER;
  if (path === 'who-can') return whoCan(context);
  if (path.startsWith('groups/')) {
    return service.groupName(decodeSegment(path.slice('groups/'.length)));
  }
  const diff = /^versions\/([^/]+)\/diff$/.exec(path);
  if (diff) return service.repository.diff(diff[1], url.searchParams.get('against') ?? undefined);
  return null;
}
async function deactivationResponse(context: AdminRequest, match: RegExpExecArray) {
  const body = await objectBody(context.request);
  if (typeof body.reason !== 'string' || !body.reason.trim()) throw new AdminConfigError('Expected reason.');
  const change = { disabled: match[2] === 'deactivate', reason: body.reason };
  const id = decodeSegment(match[1]);
  return context.service.setDeactivated(id, change, actorOf(context.request));
}
async function postResponse(context: AdminRequest): Promise<unknown> {
  const { service, path, request } = context;
  const user = /^users\/([^/]+)\/(deactivate|reactivate)$/.exec(path);
  if (user) return deactivationResponse(context, user);
  const body = await objectBody(request);
  if (path === 'check') return accessCheck(service, body);
  if (path === 'policies/validate') return validatePolicies(body.rules, service.repository.load().roles);
  if (path === 'policies/template') return policyTemplate(policyTemplateFrom(body));
  if (path === 'policies/dry-run') return service.dryRun(body);
  const rollback = /^versions\/([^/]+)\/rollback$/.exec(path);
  if (rollback) return service.rollback(decodeSegment(rollback[1]), body, actorOf(request));
  return null;
}
async function changeResponse(context: AdminRequest): Promise<unknown> {
  const { service, path, request, options } = context;
  if (request.method === 'PUT' && SAVE_AREAS.includes(path)) {
    return service.save(path, await objectBody(request), actorOf(request));
  }
  if (request.method === 'DELETE' && path.startsWith('sessions/')) {
    const principal = decodeSegment(path.slice('sessions/'.length));
    await options.authentication?.sessions.endPrincipal(principal);
    return { ended: true };
  }
  if (request.method === 'POST') return postResponse(context);
  return null;
}

/** Mounts the administration contract behind the shared Admin route boundary. */
export function adminRoutes(getService: () => Promise<AccessAdmin>, options: HandlerOptions): Route {
  return async (_workspace, request, url) => {
    if (!url.pathname.startsWith('/api/admin/')) return null;
    const service = await getService();
    const path = url.pathname.slice('/api/admin/'.length);
    const context: AdminRequest = { service, request, url, path, options };
    const body = request.method === 'GET' ? await getResponse(context) : await changeResponse(context);
    return body === null ? null : Response.json(body);
  };
}
