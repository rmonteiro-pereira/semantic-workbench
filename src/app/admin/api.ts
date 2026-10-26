import { patchDiffs } from './version-diff';
import { apiFetch } from '../projects/api';
import type {
  AdminUser,
  RolesResponse,
  Grant,
  ProjectsConfig,
  AgentsConfig,
  Policy,
  DryRun,
  Version,
  VersionDiff,
  Settings,
  Provider,
  Session,
  AccessExplanation,
  AuditPage,
  Proposal,
  AccessArea,
  AdminRule,
  PolicyTemplate,
} from './types';

/** Preserves structured refusal details for stale versions, role usage and the last Admin guard. */
export class AdminApiError extends Error {
  /** The server's refusal in words, without the request it answered. */
  public reason: string;
  constructor(
    public status: number,
    public details: Record<string, unknown>,
    context: string,
  ) {
    const reason = refusalText(status, details);
    super(`${context}: ${reason}`);
    this.name = 'AdminApiError';
    this.reason = reason;
  }
}

/** What a dialog shows for a failure: the refusal itself, not the HTTP request behind it. */
export function problemText(problem: unknown): string {
  if (problem instanceof AdminApiError) return problem.reason;
  return problem instanceof Error ? problem.message : String(problem);
}

// Refusals carry a short code in `error` and, for guards, a sentence in `message`; both are shown
// so the reader sees which guard refused and why.
function refusalText(status: number, details: Record<string, unknown>): string {
  let code = typeof details.error === 'string' ? details.error : '';
  // A role deletion refused for lack of confirmation answers with `inUse` alone.
  if (!code && details.inUse) code = 'role in use';
  const sentence = typeof details.message === 'string' ? details.message : '';
  let text = [code, sentence].filter(Boolean).join(': ') || `request failed (${status})`;
  if (details.bootstrap === true) {
    text += ' A bootstrap Admin configured on the server can still sign in and restore access.';
  }
  return text;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Administration API returned an invalid object.');
  }
  return value as Record<string, unknown>;
}

function fields<T>(value: unknown, required: Record<string, string>): T {
  const entry = object(value);
  for (const [key, kind] of Object.entries(required)) {
    let valid = typeof entry[key] === kind;
    if (kind === 'array') valid = Array.isArray(entry[key]);
    if (kind === 'object')
      valid = Boolean(entry[key]) && typeof entry[key] === 'object' && !Array.isArray(entry[key]);
    if (!valid) throw new Error(`Administration API returned invalid ${key}.`);
  }
  return entry as T;
}

function list<T>(value: unknown, required: Record<string, string>): T[] {
  if (!Array.isArray(value)) throw new Error('Administration API returned an invalid list.');
  return value.map(entry => fields<T>(entry, required));
}

async function request(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const response = await apiFetch(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (response.status === 204 && response.ok) return null;
  if (!response.ok) {
    throw new AdminApiError(response.status, await errorDetails(response), `${method} ${path}`);
  }
  return response.json();
}

// A proxy or an older server can answer an error with plain text instead of the JSON body the
// contract describes; the text then becomes the error message.
async function errorDetails(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Not JSON: fall through to the plain-text message below.
  }
  return { error: text.trim() || response.statusText || `request failed (${response.status})` };
}

function query(filters: Record<string, string | undefined>) {
  return new URLSearchParams(
    Object.entries(filters).filter((pair): pair is [string, string] => Boolean(pair[1])),
  ).toString();
}

const version = (value: unknown) => fields<{ version: string }>(value, { version: 'string' });

/** An administration document and the commit it was read at, to send back as `baseVersion`. */
export type Versioned<T> = { version: string; document: T };

// Document responses carry the response-only `version` beside the document's own fields; it is
// split off so the document can be proposed back unchanged.
function versioned<T>(value: unknown, required: Record<string, string>): Versioned<T> {
  fields(value, required);
  const { version: current, ...document } = fields<Record<string, unknown>>(value, {
    version: 'string',
  });
  return { version: current as string, document: document as T };
}
const roleFields = { id: 'string', name: 'string', description: 'string', permissions: 'array' };

function strings(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || !value.every(entry => typeof entry === 'string')) {
    throw new Error(`Administration API returned invalid ${name}.`);
  }
  return value;
}

function roleResponse(value: unknown): RolesResponse['custom'][number] {
  const role = fields<RolesResponse['custom'][number]>(value, roleFields);
  for (const permission of role.permissions) {
    fields(permission, { actions: 'array' });
    strings(permission.actions, 'role actions');
  }
  return role;
}

function grantResponse(value: unknown): Grant {
  const grant = fields<Grant>(value, {
    id: 'string',
    roleId: 'string',
    member: 'object',
    scope: 'object',
    addedBy: 'string',
    addedAt: 'string',
  });
  if (grant.member.kind === 'group') fields(grant.member, { groupId: 'string' });
  else if (grant.member.kind === 'email') fields(grant.member, { email: 'string' });
  else throw new Error('Administration API returned an invalid grant member.');
  if (grant.scope.kind === 'domains') strings(grant.scope.domains, 'grant domains');
  else if (grant.scope.kind === 'projects') strings(grant.scope.projects, 'grant projects');
  else if (grant.scope.kind !== 'workspace')
    throw new Error('Administration API returned an invalid grant scope.');
  return grant;
}

function settingsResponse(value: unknown): Settings {
  const settings = fields<Settings>(value, {
    session: 'object',
    remote: 'object',
    audit: 'object',
  });
  fields(settings.session, { idleHours: 'number', absoluteHours: 'number' });
  fields(settings.remote, { allowedHosts: 'array', azureDevOpsObo: 'boolean', github: 'object' });
  fields(settings.remote.github, { host: 'string', appConfigured: 'boolean' });
  fields(settings.audit, { retentionDays: 'number' });
  strings(settings.remote.allowedHosts, 'allowed hosts');
  return settings;
}

/** Typed administration requests; every request uses the shared cookie and CSRF wrapper. */
export const adminApi = {
  async users(q = '', access = '') {
    return list<AdminUser>(await request('/api/admin/users?' + query({ q, access })), {
      id: 'string',
      name: 'string',
      groups: 'array',
      roleSources: 'array',
      access: 'string',
    });
  },
  async roles() {
    const value = versioned<RolesResponse>(await request('/api/admin/roles'), {
      builtIn: 'array',
      custom: 'array',
      actions: 'array',
      conditions: 'array',
      usage: 'object',
    });
    value.document.builtIn = value.document.builtIn.map(roleResponse);
    value.document.custom = value.document.custom.map(roleResponse);
    return value;
  },
  async grants() {
    const value = versioned<{ grants: Grant[] }>(await request('/api/admin/grants'), {
      grants: 'array',
    });
    value.document.grants = value.document.grants.map(grantResponse);
    return value;
  },
  async projects() {
    return versioned<ProjectsConfig>(await request('/api/admin/projects'), {
      domains: 'array',
      projects: 'object',
      classification: 'object',
    });
  },
  async agents() {
    return versioned<AgentsConfig>(await request('/api/admin/agents'), { clients: 'array' });
  },
  async group(id: string) {
    return fields<{ id: string; displayName: string | null; resolved: boolean }>(
      await request('/api/admin/groups/' + encodeURIComponent(id)),
      { id: 'string', resolved: 'boolean' },
    );
  },
  async policies() {
    return versioned<{ baseline: Policy[]; rules: Policy[]; schema: unknown }>(
      await request('/api/admin/policies'),
      { baseline: 'array', rules: 'array' },
    );
  },
  async validate(rules: Policy[]) {
    return fields<{
      ok: boolean;
      errors: { id: string; line: number; column: number; message: string }[];
    }>(await request('/api/admin/policies/validate', 'POST', { rules }), {
      ok: 'boolean',
      errors: 'array',
    });
  },
  async policyTemplate(input: PolicyTemplate) {
    return fields<AdminRule>(await request('/api/admin/policies/template', 'POST', input), {
      id: 'string',
      text: 'string',
      enabled: 'boolean',
    });
  },
  async dryRun(proposal: Proposal) {
    return fields<DryRun>(await request('/api/admin/policies/dry-run', 'POST', proposal), {
      dryRunId: 'string',
      changed: 'array',
      people: 'array',
      matrixCases: 'number',
      auditCases: 'number',
    });
  },
  async save(
    area: AccessArea,
    proposal: Proposal,
    baseVersion: string,
    dryRunId: string,
    confirmDeleteInUse = false,
  ) {
    if (!dryRunId) throw new Error('Review a dry run before saving.');
    return version(
      await request('/api/admin/' + area, 'PUT', {
        ...proposal,
        baseVersion,
        dryRunId,
        ...(confirmDeleteInUse ? { confirmDeleteInUse } : {}),
      }),
    );
  },
  async versions(area = '') {
    const entries = list<Version & { author: unknown }>(
      await request('/api/admin/versions?' + query({ area })),
      { version: 'string', at: 'string', message: 'string', files: 'array' },
    );
    return entries.map(entry => {
      const author =
        typeof entry.author === 'string'
          ? entry.author
          : fields<{ name: string; email: string }>(entry.author, {
              name: 'string',
              email: 'string',
            }).name;
      return { ...entry, author };
    });
  },
  async diff(selected: string, against: string) {
    const value = await request(
      `/api/admin/versions/${encodeURIComponent(selected)}/diff?` + query({ against }),
    );
    if (Array.isArray(value))
      return list<VersionDiff>(value, { file: 'string', before: 'string', after: 'string' });
    const patches = object(value);
    if (!Object.values(patches).every(patch => typeof patch === 'string'))
      throw new Error('Invalid version diff.');
    return patchDiffs(patches as Record<string, string>);
  },
  async rollback(selected: string, baseVersion: string, dryRunId: string) {
    if (!dryRunId) throw new Error('Review the rollback before confirming it.');
    return version(
      await request(`/api/admin/versions/${encodeURIComponent(selected)}/rollback`, 'POST', {
        baseVersion,
        dryRunId,
      }),
    );
  },
  async changeUser(id: string, operation: 'deactivate' | 'reactivate', reason: string) {
    return version(
      await request(`/api/admin/users/${encodeURIComponent(id)}/${operation}`, 'POST', { reason }),
    );
  },
  async sessions() {
    return list<Session>(await request('/api/admin/sessions'), {
      principal: 'string',
      name: 'string',
      createdAt: 'string',
      lastSeenAt: 'string',
    });
  },
  async endSessions(id: string) {
    await request('/api/admin/sessions/' + encodeURIComponent(id), 'DELETE');
  },
  async settings() {
    const value = await request('/api/admin/settings');
    settingsResponse(value);
    return versioned<Settings>(value, {});
  },
  async saveSettings(settings: Settings, baseVersion: string) {
    return version(await request('/api/admin/settings', 'PUT', { ...settings, baseVersion }));
  },
  async provider() {
    // Local mode has no issuer, client or key refresh, so those three may be null.
    return fields<Provider>(await request('/api/admin/provider'), {
      discovery: 'string',
      groupClaimMode: 'string',
      overage: 'string',
    });
  },
  async check(
    principal: string | { groups: string[]; email: string },
    action: string,
    resource: { type: string; project?: string; path?: string; branch?: string; metric?: string },
  ) {
    return fields<AccessExplanation>(
      await request('/api/admin/check', 'POST', { principal, action, resource }),
      { grants: 'array', roles: 'array', rules: 'array', attributes: 'object' },
    );
  },
  async whoCan(project: string, path: string) {
    return list<{
      group?: string;
      email?: string;
      principal?: string;
      client?: string;
      via?: string;
      actions: string[];
    }>(await request('/api/admin/who-can?' + query({ project, path })), { actions: 'array' });
  },
  async audit(filters: Record<string, string>) {
    return fields<AuditPage>(await request('/api/audit?' + query(filters)), { entries: 'array' });
  },
  async exportAudit(filters: Record<string, string>, format: 'jsonl' | 'csv') {
    const response = await apiFetch(
      '/api/audit/export?' + query({ ...filters, format, cursor: undefined }),
    );
    if (!response.ok) {
      throw new AdminApiError(response.status, await errorDetails(response), 'Export audit');
    }
    return response.blob();
  },
};
