// Serves the Admin panel harness and canned administration responses shaped like the HTTP API
// contract, so dialogs can be tested and measured in Chromium without a running server.
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page, Route } from '@playwright/test';
import builtin from '../../policies/builtin-roles.json';
import type { Me } from '../../src/app/auth/useMe';
import { TEST_GROUPS } from './auth-identities';

/** The origin the harness page is served from inside Playwright's request routing. */
export const ADMIN_HARNESS_URL = 'http://admin.test/';

/** One administration request the harness page sent, with its parsed JSON body. */
export type RecordedRequest = { path: string; method: string; body: any };

/** Requests seen so far and switches that make the next saves fail like the server would. */
export type AdminMockState = {
  requests: RecordedRequest[];
  refuseSaves: boolean;
  me: Me;
};

const adminIdentity: Me = {
  mode: 'server',
  id: 'tenant:dave',
  name: 'Dave Dias',
  verifiedEmail: 'dave@example.org',
  can: { admin: true, audit: true },
  roleSources: [{ via: 'bootstrap' }],
  roles: { workspace: ['admin'], projects: {} },
  roleNames: { admin: 'Admin', editor: 'Editor', viewer: 'Viewer', steward: 'Steward' },
};

const metricReviewer = {
  id: 'r_metricreviewer',
  name: 'Metric reviewer',
  description: 'Approves metrics in the Sales domain only.',
  permissions: [{ actions: ['read', 'approveMetric'], conditions: { docType: ['metric'] } }],
};

// Every document response carries the administration version it was read at.
const VERSION = 'base';

const roles = {
  version: VERSION,
  builtIn: builtin.roles,
  custom: [metricReviewer],
  actions: ['read', 'export', 'history', 'edit', 'approveMetric', 'publish', 'push', 'admin'],
  conditions: ['branch', 'path', 'docType', 'maxLevel'],
  usage: {
    r_metricreviewer: { grants: 1, people: 1 },
  },
};

const grants = [
  {
    id: 'g_sales_editors',
    roleId: 'editor',
    member: { kind: 'group', groupId: TEST_GROUPS.salesEditors.id },
    scope: { kind: 'domains', domains: ['sales'] },
    addedBy: 'tenant:dave',
    addedAt: '2026-10-01T09:30:00Z',
  },
  {
    id: 'g_erin',
    roleId: 'viewer',
    member: { kind: 'email', email: 'erin.with.a.long.address@subsidiary.example.org' },
    scope: { kind: 'projects', projects: ['sales-contracts', 'lab-notes'] },
    addedBy: 'tenant:dave',
    addedAt: '2026-10-02T14:05:00Z',
  },
  {
    id: 'g_reviewer',
    roleId: 'r_metricreviewer',
    member: { kind: 'group', groupId: TEST_GROUPS.finance.id },
    scope: { kind: 'workspace' },
    addedBy: 'tenant:dave',
    addedAt: '2026-10-03T08:00:00Z',
  },
];

const users = [
  {
    id: 'tenant:alice',
    name: 'Alice Andrade',
    kind: 'person',
    verifiedEmail: 'alice@example.org',
    lastSignInAt: '2026-10-21T17:12:00Z',
    groups: [
      {
        id: TEST_GROUPS.salesEditors.id,
        displayName: TEST_GROUPS.salesEditors.name,
        resolved: true,
      },
      { id: TEST_GROUPS.finance.id, displayName: null, resolved: false },
    ],
    roleSources: [
      {
        roleId: 'editor',
        scope: { kind: 'domains', domains: ['sales'] },
        via: 'group',
        group: { id: TEST_GROUPS.salesEditors.id, name: TEST_GROUPS.salesEditors.name },
      },
      {
        roleId: 'r_metricreviewer',
        scope: { kind: 'workspace' },
        via: 'group',
        group: { id: TEST_GROUPS.finance.id },
      },
    ],
    access: 'granted',
    deactivated: false,
  },
  {
    id: 'tenant:dave',
    name: 'Dave Dias',
    kind: 'person',
    verifiedEmail: 'dave@example.org',
    lastSignInAt: '2026-10-22T08:00:00Z',
    groups: [],
    roleSources: [{ roleId: 'admin', scope: { kind: 'workspace' }, via: 'bootstrap' }],
    access: 'granted',
    deactivated: false,
  },
  {
    id: 'tenant:erin',
    name: 'Erin',
    kind: 'person',
    verifiedEmail: 'erin@example.org',
    lastSignInAt: '2026-10-20T11:45:00Z',
    groups: [],
    roleSources: [],
    access: 'none',
    deactivated: false,
  },
];

const projects = {
  version: VERSION,
  domains: [
    { id: 'sales', name: 'Sales' },
    { id: 'hr', name: 'Human resources' },
  ],
  projects: {
    sales: {
      domain: 'sales',
      everyoneCanRead: true,
      stewards: ['alice@example.org'],
      restricted: [],
      protectedBranches: ['main'],
    },
    'sales-contracts': {
      domain: 'sales',
      stewards: [],
      restricted: [{ pattern: 'contracts/private/**', groups: [], emails: ['alice@example.org'] }],
      protectedBranches: ['main', 'release/*'],
      protectedLevel: 'confidential',
    },
  },
  classification: {
    levels: ['public', 'internal', 'confidential', 'restricted'],
    aliases: {},
    protectedLevel: 'confidential',
  },
};

const policies = {
  version: VERSION,
  baseline: [
    {
      id: 'baseline-deactivated',
      text: 'forbid(principal, action, resource) when { principal.deactivated };',
      description: 'Deactivated people can do nothing',
    },
  ],
  rules: [
    {
      id: 'p_branchlimit',
      text: '@enabled("true")\nforbid(principal, action == SW::Action::"push", resource);',
      enabled: true,
      template: 'Git action limits',
      description: 'No pushes to release branches',
    },
  ],
  schema: {},
};

const versions = [
  {
    version: VERSION,
    author: { name: 'Dave Dias', email: 'dave@example.org' },
    at: '2026-10-21T10:00:00Z',
    message: 'Grant Sales Editors the Editor role',
    files: ['grants.json'],
  },
  {
    version: 'older',
    author: { name: 'Dave Dias', email: 'dave@example.org' },
    at: '2026-10-20T10:00:00Z',
    message: 'Add the Sales domain',
    files: ['projects.json'],
  },
];

const diff = {
  'grants.json': '@@ -1,3 +1,4 @@\n {\n   "grants": [\n+    {"id": "g_sales_editors"}\n   ]\n',
};

const auditEntry = {
  at: '2026-10-22T07:59:00Z',
  requestId: 'req-1',
  principal: { id: 'tenant:alice', name: 'Alice Andrade' },
  action: 'edit',
  resource: { project: 'sales-contracts', path: 'contracts/private/terms.yaml' },
  decision: 'deny',
  outcome: 'refused',
  rules: ['baseline-restricted-paths'],
};

const settings = {
  version: VERSION,
  session: { idleHours: 8, absoluteHours: 24 },
  remote: {
    allowedHosts: ['dev.azure.com', 'github.com'],
    azureDevOpsObo: true,
    github: { host: 'github.com', appConfigured: false },
  },
  audit: { retentionDays: 400 },
};

const provider = {
  issuer: 'https://login.example.org/tenant/v2.0',
  clientId: 'workbench',
  discovery: 'ok',
  groupClaimMode: 'groups',
  overage: 'directory',
  jwksRefreshedAt: '2026-10-22T07:00:00Z',
};

const dryRun = {
  dryRunId: 'review',
  changed: [
    {
      case: 'alice edit sales-contracts/contracts/terms.yaml',
      before: 'allow',
      after: 'deny',
      rules: ['p_branchlimit'],
    },
  ],
  matrixCases: 20,
  auditCases: 10,
  people: [
    {
      principal: 'tenant:erin',
      name: 'Erin',
      project: 'sales',
      gained: ['read'],
      lost: [],
      access: 'gained',
    },
    {
      principal: 'tenant:alice',
      name: 'Alice Andrade',
      project: 'sales-contracts',
      gained: [],
      lost: ['approveMetric'],
      access: 'kept',
    },
  ],
};

// The template route answers with server-generated rule text; the mock returns a fixed rule.
const templateRule = {
  id: 'p_template',
  enabled: true,
  template: 'git-limits',
  text: 'forbid(principal, action in [SW::Action::"push"], resource)\nwhen { true };',
};

const accessExplanation = {
  decision: { allow: true },
  grants: [{ grantId: 'g_erin', roleId: 'editor', via: 'email' }],
  roles: ['editor'],
  rules: ['role:editor:1'],
  attributes: { project: 'sales', domain: 'sales' },
};

function auditPage(url: URL) {
  return { entries: [auditEntry], next: url.searchParams.has('cursor') ? null : 'next' };
}

const workspaceProjects = [
  { slug: 'sales-contracts', name: 'Sales contracts', files: [] },
  { slug: 'lab-notes', name: 'Lab notes', files: [] },
];

function gitStatus(slug: string) {
  const remotes = slug === 'sales-contracts' ? { origin: 'https://git.example.org/sales.git' } : {};
  return { branch: 'main', upstream: '', ahead: 0, behind: 0, remotes, changes: [] };
}

const fixedResponses: Record<string, unknown> = {
  '/api/projects': workspaceProjects,
  '/api/admin/roles': roles,
  '/api/admin/grants': { grants, version: VERSION },
  '/api/admin/users': users,
  '/api/admin/projects': projects,
  '/api/admin/agents': {
    version: VERSION,
    clients: [{ clientId: 'reporting-agent', name: 'Reporting agent', projects: [], domains: [] }],
  },
  '/api/admin/policies': policies,
  '/api/admin/policies/validate': {
    ok: false,
    errors: [{ id: 'rule', line: 1, column: 2, message: 'Invalid policy' }],
  },
  '/api/admin/policies/dry-run': dryRun,
  '/api/admin/settings': settings,
  '/api/admin/provider': provider,
  '/api/admin/sessions': [
    {
      principal: 'tenant:alice',
      name: 'Alice Andrade',
      createdAt: '2026-10-22T07:00:00Z',
      lastSeenAt: '2026-10-22T07:58:00Z',
    },
  ],
  '/api/admin/check': accessExplanation,
  '/api/admin/who-can': [
    { email: 'erin@example.org', via: 'g_erin', actions: ['read', 'edit'] },
    { group: TEST_GROUPS.salesEditors.id, via: 'g_sales_editors', actions: ['read', 'edit'] },
  ],
  '/api/admin/versions': versions,
};

/** Picks the canned body for one administration request; unknown routes get an empty object. */
export function adminMockResponse(url: URL, method: string, state: AdminMockState) {
  const path = url.pathname;
  if (method === 'PUT' && state.refuseSaves) {
    return {
      status: 400,
      body: {
        error: 'last-admin',
        message: 'This change would remove the last active Admin.',
        bootstrap: true,
      },
    };
  }
  if (method === 'PUT') return { status: 200, body: { version: 'saved' } };
  if (path === '/api/me') return { status: 200, body: state.me };
  if (path === '/api/audit') return { status: 200, body: auditPage(url) };
  if (path.startsWith('/api/admin/groups/')) {
    const id = decodeURIComponent(path.slice('/api/admin/groups/'.length));
    const group = Object.values(TEST_GROUPS).find(entry => entry.id === id);
    return {
      status: 200,
      body: { id, displayName: group?.name ?? null, resolved: Boolean(group) },
    };
  }
  const statusMatch = path.match(/^\/api\/projects\/([^/]+)\/git\/status$/);
  if (statusMatch) return { status: 200, body: gitStatus(statusMatch[1]) };
  if (path.endsWith('/diff')) return { status: 200, body: diff };
  if (path.endsWith('/rollback')) return { status: 200, body: { version: 'rolled-back' } };
  if (path === '/api/admin/policies/template') return { status: 200, body: templateRule };
  return { status: 200, body: fixedResponses[path] ?? {} };
}

/** Bundles the harness in a separate process because Bun.build inside `bun test` cannot
 * resolve some extensionless imports of the editor modules. */
export async function buildAdminHarness(): Promise<{ script: string; style: string }> {
  const outdir = await mkdtemp(join(tmpdir(), 'admin-harness-'));
  try {
    const build = Bun.spawnSync([process.execPath, 'build', 'tests/harness/admin-harness.tsx', '--target=browser', '--outdir', outdir, '--define', 'process.env.NODE_ENV="development"'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (build.exitCode !== 0) throw new Error(build.stderr.toString());
    const files = await readdir(outdir);
    const styles = files.filter(file => file.endsWith('.css'));
    const style = (await Promise.all(styles.map(file => Bun.file(join(outdir, file)).text()))).join('\n');
    return { script: await Bun.file(join(outdir, 'admin-harness.js')).text(), style };
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
}

async function fulfil(route: Route, state: AdminMockState) {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname === '/') {
    await route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
    return;
  }
  state.requests.push({
    path: url.pathname,
    method: request.method(),
    body: request.postDataJSON(),
  });
  const { status, body } = adminMockResponse(url, request.method(), state);
  await route.fulfill({ status, json: body });
}

/** Opens the harness page with every administration request answered by the mock. */
export async function openAdminHarness(page: Page, state: AdminMockState) {
  const { script, style } = await buildAdminHarness();
  await page.route(ADMIN_HARNESS_URL + '**', route => fulfil(route, state));
  await page.goto(ADMIN_HARNESS_URL);
  await page.addStyleTag({ content: style });
  await page.addScriptTag({ content: script, type: 'module' });
}

/** A fresh mock state signed in as a bootstrap Admin in server mode. */
export function adminMockState(): AdminMockState {
  return { requests: [], refuseSaves: false, me: adminIdentity };
}
