// One guarded change sent through every content write path, for the authorization matrix.
import { expect } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAccessControl } from '../../server/auth/authorize';
import { createHandler } from '../../server/handler';
import type { Workspace } from '../../server/projects/workspace';
import type { TestUserName } from '../helpers/auth-identities';
import { sh } from '../helpers/scm';
import { LOCAL_READER } from '../../server/projects/reader';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { accessFixture, person } from './access-fixture';

/** A write request and the guarded part it must name when an Editor sends it. */
export type GuardCase = {
  name: string;
  method: string;
  path: string;
  body: unknown;
  guarded: { file: string; pointer: string; kind: string };
};

const CONTRACT = 'orders.odcs.yaml';
const METRICS = 'sales.semantic.yaml';
/** The pointer of the `amount` property, whose classification the cases change. */
const AMOUNT = '/schema/0/properties/2';

/** The contract with the `amount` property's classification lowered from internal to public. */
export function reclassified(source: string) {
  return source.replace('classification: internal', 'classification: public');
}

function classificationCases(ws: Workspace): GuardCase[] {
  const file = ws.readFile('sales-contracts', CONTRACT);
  const after = reclassified(file.source);
  const offset = file.source.indexOf('classification: internal') + 'classification: '.length;
  const patch = { from: offset, to: offset + 'internal'.length, insert: 'public' };
  const guarded = { file: CONTRACT, pointer: AMOUNT, kind: 'classification' };
  const project = '/api/projects/sales-contracts';
  const mapping = ws.readFile('sales-contracts', 'sales.mapping.yaml');
  const unguarded = mapping.source.replace('\n', '\n# reviewed\n');
  return [
    {
      name: 'Source save',
      method: 'PUT',
      path: `${project}/files/${CONTRACT}`,
      body: { baseHash: file.hash, source: after },
      guarded,
    },
    {
      name: 'item edit',
      method: 'PUT',
      path: `${project}/files/${CONTRACT}`,
      body: { baseHash: file.hash, patches: [patch] },
      guarded,
    },
    {
      name: 'save-batch',
      method: 'POST',
      path: `${project}/save-batch`,
      body: {
        files: [
          { path: 'sales.mapping.yaml', baseHash: mapping.hash, source: unguarded },
          { path: CONTRACT, baseHash: file.hash, source: after },
        ],
      },
      guarded,
    },
    {
      name: 'legacy document save',
      method: 'POST',
      path: '/api/documents',
      body: {
        id: 'sales-contracts/' + CONTRACT,
        filename: CONTRACT,
        source: after,
        baseHash: file.hash,
      },
      guarded,
    },
    {
      name: 'import with replace',
      method: 'POST',
      path: `${project}/import`,
      body: { files: [{ path: CONTRACT, source: after }], onConflict: 'replace' },
      guarded,
    },
  ];
}

function metricCase(ws: Workspace): GuardCase {
  const file = ws.readFile('sales-metrics', METRICS);
  return {
    name: 'metric save',
    method: 'POST',
    path: '/api/projects/sales-metrics/metrics',
    body: {
      semanticPath: METRICS,
      metric: { name: 'net_revenue', expression: 'SUM(orders.amount)' },
      extension: { type: 'simple', owner: 'carol@example.org', status: 'approved' },
      baseHashes: { [METRICS]: file.hash },
    },
    guarded: { file: METRICS, pointer: '/metrics/3', kind: 'metric-status' },
  };
}

/** Names of the save paths every guarded save case goes through. */
export const GUARDED_SAVES = [
  'Source save',
  'item edit',
  'save-batch',
  'legacy document save',
  'import with replace',
  'metric save',
] as const;

/** The guarded saves an Editor must be refused and a Steward allowed, built from current bytes. */
export function guardedSaves(ws: Workspace): GuardCase[] {
  return [...classificationCases(ws), metricCase(ws)];
}

/** A revert that would restore the classification a Steward changed and did not commit. */
export function revertCase(ws: Workspace): GuardCase {
  const file = ws.readFile('sales-contracts', CONTRACT);
  return {
    name: 'revert',
    method: 'POST',
    path: '/api/projects/sales-contracts/git/revert',
    body: { path: CONTRACT, baseHash: file.hash },
    guarded: { file: CONTRACT, pointer: AMOUNT, kind: 'classification' },
  };
}

/**
 * A local bare remote whose default branch carries a classification change that someone else
 * committed, so pulling it brings in a guarded change. No network is involved.
 */
export function remoteWithReclassification(ws: Workspace, root: string) {
  const extra = mkdtempSync(join(tmpdir(), 'workbench-guard-remote-'));
  const repository = join(root, 'projects', 'sales-contracts');
  const bare = join(extra, 'remote.git');
  sh(extra, ['clone', '-q', '--bare', repository, bare]);
  const branch = sh(repository, ['branch', '--show-current']).trim();
  const other = join(extra, 'other');
  sh(extra, ['clone', '-q', bare, other]);
  const source = ws.readFile('sales-contracts', CONTRACT).source;
  writeFileSync(join(other, CONTRACT), reclassified(source));
  const identity = ['-c', 'user.name=Someone', '-c', 'user.email=someone@example.org'];
  sh(other, [...identity, 'commit', '-q', '-am', 'Reclassify amount']);
  sh(other, ['push', '-q', 'origin', branch]);
  return {
    bare,
    pull: {
      name: 'pull',
      method: 'POST',
      path: '/api/projects/sales-contracts/git/pull',
      body: {},
      guarded: { file: CONTRACT, pointer: AMOUNT, kind: 'classification' },
    } satisfies GuardCase,
    dispose: () => rmSync(extra, { recursive: true, force: true }),
  };
}

const origin = 'http://localhost';

/** A server-mode handler acting as one fixture person. */
export function guardHandler(ws: Workspace, name: TestUserName) {
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person(name));
  return createHandler(ws, {
    mode: 'server',
    access,
    principal: () => principal,
    publicOrigin: origin,
    remoteCredentials: allowEveryRemote(),
  });
}

/** Sends one case's request through a handler. */
export function sendCase(handler: ReturnType<typeof createHandler>, item: GuardCase) {
  return handler(
    new Request(origin + item.path, {
      method: item.method,
      headers: { Origin: origin, 'X-SW-Request': '1' },
      body: JSON.stringify(item.body),
    }),
  );
}

/** Every byte under the data root except the audit log, which records the refusal. */
export function dataSnapshot(root: string, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (path === 'state/audit' || path.startsWith('cache.sqlite')) continue;
    if (entry.isDirectory()) Object.assign(result, dataSnapshot(root, path));
    else result[path] = readFileSync(join(root, path)).toString('base64');
  }
  return result;
}

/** Checks the refusal body and that the audit log recorded the guard that refused it. */
export async function expectGuardRefusal(response: Response, item: GuardCase, root: string) {
  const body = await response.json();
  expect(response.status, `${item.name}: ${JSON.stringify(body)}`).toBe(403);
  expect(body.guarded, item.name).toContainEqual(item.guarded);
  const audit = join(root, 'state/audit');
  const lines = readdirSync(audit).flatMap(name =>
    readFileSync(join(audit, name), 'utf8').trim().split('\n'),
  );
  const requestId = response.headers.get('X-Request-Id')!;
  const entry = JSON.parse(lines.find(line => line.includes(requestId))!);
  expect(entry.decision).toBe('deny');
  expect(entry.reason).toBe('guarded:' + item.guarded.kind);
  return body;
}

/** Deleting the contract removes its confidential property. */
export function deleteCase(): GuardCase {
  return {
    name: 'delete',
    method: 'DELETE',
    path: `/api/projects/sales-contracts/files/${CONTRACT}`,
    body: { confirm: true },
    guarded: { file: CONTRACT, pointer: '/schema/0/properties/1', kind: 'protected-property' },
  };
}

/**
 * A contract an Editor may delete, as nothing in it is protected, but whose classified
 * properties a restore re-creates.
 */
export function unprotectedContract(ws: Workspace) {
  const source = ws.readFile('sales-contracts', CONTRACT).source;
  return source
    .replace('classification: confidential', 'classification: internal')
    .replace('1b0c6a52-3f0e-4c55-9d0e-6a1f2b3c4d01', '1b0c6a52-3f0e-4c55-9d0e-6a1f2b3c4d99');
}

/** Restoring a deleted contract re-creates its classifications. */
export function restoreCase(entryId: string, file: string): GuardCase {
  return {
    name: 'restore',
    method: 'POST',
    path: `/api/trash/${entryId}/undo`,
    body: {},
    guarded: { file, pointer: AMOUNT, kind: 'classification' },
  };
}

/** An import that creates a project holding a metric approved and owned by the given person. */
export function newProjectImport(ws: Workspace, owner: string): GuardCase {
  const source = ws
    .readFile('sales-metrics', METRICS)
    .source.replace('"owner": "bob@example.org"', `"owner": "${owner}"`);
  return {
    name: 'new-project import',
    method: 'POST',
    path: '/api/import',
    body: { name: 'Imported metrics', domain: 'sales', files: [{ path: METRICS, source }] },
    guarded: { file: METRICS, pointer: '/metrics/0', kind: 'metric-status' },
  };
}

/** Moving the contract to another project removes its confidential property from its project. */
export function moveCase(): GuardCase {
  return {
    name: 'move',
    method: 'POST',
    path: '/api/projects/sales-contracts/move',
    body: { path: CONTRACT, toProject: 'sales-metrics' },
    guarded: { file: CONTRACT, pointer: '/schema/0/properties/1', kind: 'protected-property' },
  };
}

/** A local branch of the contracts repository whose contract has another classification. */
export function branchWithReclassification(ws: Workspace, root: string) {
  const repository = join(root, 'projects', 'sales-contracts');
  const current = sh(repository, ['branch', '--show-current']).trim();
  const identity = ['-c', 'user.name=Someone', '-c', 'user.email=someone@example.org'];
  sh(repository, ['switch', '-q', '-c', 'reclassify']);
  const source = ws.readFile('sales-contracts', CONTRACT).source;
  writeFileSync(join(repository, CONTRACT), reclassified(source));
  sh(repository, [...identity, 'commit', '-q', '-am', 'Reclassify amount']);
  sh(repository, ['switch', '-q', current]);
  return {
    name: 'switch',
    method: 'POST',
    path: '/api/projects/sales-contracts/git/switch',
    body: { branch: 'reclassify' },
    guarded: { file: CONTRACT, pointer: AMOUNT, kind: 'classification' },
  } satisfies GuardCase;
}

/** What a case builder starts from: a fixture workspace and its data root. */
export type CaseContext = { ws: Workspace; root: string };

/** A case built from the current fixture bytes, with what it set up outside the workspace. */
export type BuiltCase = GuardCase & { dispose?: () => void };

function savedCase(name: (typeof GUARDED_SAVES)[number]) {
  return ({ ws }: CaseContext) => guardedSaves(ws).find(item => item.name === name)!;
}

/** A deleted contract whose restore would re-create classified properties. */
async function deletedContract({ ws }: CaseContext) {
  const file = 'catalog.odcs.yaml';
  await ws.saveFile(
    'sales-contracts',
    file,
    { baseHash: null, source: unprotectedContract(ws) },
    LOCAL_READER,
  );
  const entry = await ws.trash.deleteFile('sales-contracts', file, undefined, LOCAL_READER);
  return restoreCase(entry.entryId, file);
}

function pullCase({ ws, root }: CaseContext): BuiltCase {
  const remote = remoteWithReclassification(ws, root);
  return { ...remote.pull, dispose: remote.dispose };
}

/**
 * Every case the guard matrix can send through the server, keyed by its name, so a name exists
 * only where a builder makes a runnable case for it.
 */
export const GUARD_CASES = {
  'Source save': savedCase('Source save'),
  'item edit': savedCase('item edit'),
  'save-batch': savedCase('save-batch'),
  'legacy document save': savedCase('legacy document save'),
  'import with replace': savedCase('import with replace'),
  'metric save': savedCase('metric save'),
  revert: ({ ws }: CaseContext) => revertCase(ws),
  pull: pullCase,
  delete: () => deleteCase(),
  restore: deletedContract,
  'new-project import': ({ ws }: CaseContext) => newProjectImport(ws, 'bob@example.org'),
  move: () => moveCase(),
  switch: ({ ws, root }: CaseContext) => branchWithReclassification(ws, root),
} satisfies Record<string, (context: CaseContext) => BuiltCase | Promise<BuiltCase>>;

/**
 * Every route whose action can change content, and the matrix case that proves its guard. A
 * route sharing a workspace method with a tested one names that case.
 */
export const GUARDED_ROUTES: Record<string, keyof typeof GUARD_CASES> = {
  'POST /api/import': 'new-project import',
  'POST /api/documents': 'legacy document save',
  'POST /api/projects/:slug/move': 'move',
  'POST /api/projects/:slug/import': 'import with replace',
  'POST /api/projects/:slug/save-batch': 'save-batch',
  'POST /api/projects/:slug/metrics': 'metric save',
  'POST /api/projects/:slug/kpis': 'metric save',
  'PUT /api/projects/:slug/files/*': 'Source save',
  'DELETE /api/projects/:slug/files/*': 'delete',
  'POST /api/trash/:entry/undo': 'restore',
  'POST /api/trash/:entry/restore': 'restore',
  'POST /api/suggestions/:id/accept': 'move',
  'POST /api/projects/:slug/git/revert': 'revert',
  'POST /api/projects/:slug/git/switch': 'switch',
  'POST /api/projects/:slug/git/pull': 'pull',
  'POST /api/projects/:slug/git/sync': 'pull',
};

/** Every Admin panel route: the Admin edits access rules there, never project content. */
export const ADMIN_EXEMPTION = 'Admin panel: changes access rules and settings, not project files';

/** Routes beyond plain reads that are not content-guarded, and why. */
export const GUARD_EXEMPTIONS: Record<string, string> = {
  'POST /api/projects': 'creates an empty project; its files arrive through guarded saves',
  'POST /api/examples/:name': 'loads the shipped examples, which hold no person’s approvals',
  'POST /api/clone': 'Admin only; the Admin chooses the repository it brings in',
  'POST /api/clone/:operation/cancel': 'stops a clone and writes no content',
  'GET /api/repos/:repo/project-candidates': 'Admin only and reads',
  'PUT /api/repos/:repo/projects': 'Admin only; registers folders already on disk',
  'POST /api/projects/:slug/gitignore': 'a .gitignore holds no metric or classification',
  'GET /api/projects/:slug/people': 'reads the owner choices',
  'PUT /api/drafts/:slug/*': 'a personal draft is not the file; saving it is a guarded save',
  'DELETE /api/drafts/:slug/*': 'discards a personal draft',
  'POST /api/suggestions/:id/reject': 'records a rejected suggestion; no file changes',
  'POST /api/projects/:slug/metrics/preview': 'computes a preview and writes nothing',
  'POST /api/projects/:slug/kpis/preview': 'computes a preview and writes nothing',
  'POST /api/agent/plan': 'plans a query for an agent and writes nothing',
  'PUT /api/documents/:id/grouping': 'stores the person’s own grouping view, not a file',
  'POST /api/clear': 'Admin only; moves every project to the trash, whose restore is guarded',
  'PATCH /api/projects/:slug': 'renames the project, not its files',
  'DELETE /api/projects/:slug':
    'Admin only; moves the project to the trash, whose restore is guarded',
  'DELETE /api/trash': 'Admin only; empties the trash and changes no project file',
  'DELETE /api/trash/:entry': 'Admin only; drops one trash entry and changes no project file',
  'GET /api/git/credential-helper': 'answers Git with the person’s credential; no content',
  'GET /api/projects/:slug/git/identity': 'reads the commit identity',
  'PUT /api/projects/:slug/git/identity': 'sets the commit author name, not file content',
  'POST /api/projects/:slug/git/stage': 'stages files whose text was already guarded when saved',
  'POST /api/projects/:slug/git/unstage': 'unstages files; the working text does not change',
  'POST /api/projects/:slug/git/commit': 'commits text that was already guarded when saved',
  'POST /api/projects/:slug/git/fetch':
    'updates remote-tracking refs; a guarded pull brings text in',
  'POST /api/projects/:slug/git/push': 'publishes local commits; the working copy does not change',
  'POST /api/projects/:slug/git/cancel': 'stops a running Git operation',
  'PUT /api/projects/:slug/git/remote':
    'Admin only; names a remote, whose text a guarded pull checks',
  'DELETE /api/projects/:slug/git/remote': 'Admin only; removes a remote and changes no file',
  'GET /api/audit': 'reads the audit log',
  'GET /api/audit/export': 'exports the audit log',
};
