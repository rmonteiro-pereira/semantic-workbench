// Serves the proposals harness and answers its requests from a mock shaped like the proposal routes,
// so every state of the interface can be shown and measured in Chromium without a server.
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page, Route } from '@playwright/test';
import type { Me } from '../../src/app/auth/useMe';
import type { ProjectInfo } from '../../src/app/projects/api';
import type { PromotionCheck, ProposalSummary, ProposalView } from '../../src/shared/proposals/proposal';

/** The origin the harness page is served from inside Playwright's request routing. */
export const PROPOSALS_HARNESS_URL = 'http://proposals.test/';

/** One request the page sent. */
export type RecordedRequest = { path: string; method: string; body: any };

/** What the mock answers, and what it has been asked. */
export type ProposalsMock = {
  requests: RecordedRequest[];
  mode: 'server' | 'local';
  views: ProposalView[];
  listDelayMs: number;
  listStatus: number;
  check: PromotionCheck;
  refuse?: { status: number; error: string; message: string };
};

const sales: ProjectInfo = { slug: 'sales', name: 'Sales', repo: 'shared', folder: 'sales', origin: '', branch: 'work/alice', ahead: 0, behind: 0, changes: 0, files: [] } as ProjectInfo;
const billing: ProjectInfo = { ...sales, slug: 'billing', name: 'Billing', folder: 'billing' };
const people: ProjectInfo = { ...sales, slug: 'people', name: 'People', folder: 'people' };

/** The projects of the harness repository and the actions the signed-in person has on each. */
export const HARNESS_PROJECTS = { project: 'sales', projects: [sales, billing, people], actions: { sales: ['read', 'edit', 'branch'], billing: ['read', 'edit', 'branch'], people: ['read'] } };

/** A proposal view with sensible defaults, so a test names only what it cares about. */
export function proposalView(overrides: Partial<ProposalView> = {}): ProposalView {
  return {
    id: 'rename-customer',
    name: 'Rename the customer concept',
    status: 'open',
    createdByName: 'Alice Andrade',
    createdAt: '2026-11-17T10:00:00.000Z',
    lastMovementAt: '2026-11-17T12:00:00.000Z',
    projects: [{ slug: 'sales', name: 'Sales' }],
    tip: 'a'.repeat(40),
    contributors: ['Alice Andrade'],
    may: { contribute: true, promote: false, close: false, restore: false },
    behindPublished: 0,
    changes: [{ project: 'sales', files: [{ path: 'sales.ontology.yaml', status: 'changed' }] }],
    mine: null,
    ...overrides,
  };
}

/** A fresh mock with one open proposal. */
export function proposalsMock(overrides: Partial<ProposalsMock> = {}): ProposalsMock {
  return { requests: [], mode: 'server', views: [proposalView()], listDelayMs: 0, listStatus: 200, check: { ok: true, reasons: [], files: [] }, ...overrides };
}

const me = (mode: 'server' | 'local'): Me => ({ mode, name: 'Alice Andrade', verifiedEmail: null, roles: { workspace: [], projects: {} }, roleNames: {}, can: {} });

const summaryOf = ({ behindPublished: _behind, changes: _changes, mine: _mine, ...summary }: ProposalView): ProposalSummary => summary;

async function respond(route: Route, mock: ProposalsMock) {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
  mock.requests.push({ path: url.pathname + url.search, method: request.method(), body: request.postDataJSON() });
  if (url.pathname === '/api/me') return route.fulfill({ json: me(mock.mode) });
  if (url.pathname.endsWith('/git/status')) return route.fulfill({ json: { branch: 'work/alice', head: 'f'.repeat(40) } });
  const match = url.pathname.match(/\/proposals(?:\/([^/]+)(?:\/([a-z-]+))?)?$/);
  if (!match) return route.fulfill({ status: 404, json: { error: 'Not found.' } });
  const [, id, action] = match;
  if (request.method() === 'POST' && mock.refuse && action) return route.fulfill({ status: mock.refuse.status, json: { error: mock.refuse.error, message: mock.refuse.message } });
  if (!id) return listOrCreate(route, mock, request.method(), request.postDataJSON());
  const view = mock.views.find(candidate => candidate.id === id);
  if (!view) return route.fulfill({ status: 404, json: { error: 'Not found.' } });
  return act(route, mock, view, action);
}

async function listOrCreate(route: Route, mock: ProposalsMock, method: string, body: any) {
  if (method === 'POST') {
    const created = proposalView({ id: String(body.name).toLowerCase().replace(/\W+/g, '-'), name: body.name, tip: 'b'.repeat(40), contributors: [], changes: [] });
    mock.views.unshift(created);
    return route.fulfill({ status: 201, json: created });
  }
  if (mock.listDelayMs) await new Promise(resolve => setTimeout(resolve, mock.listDelayMs));
  if (mock.listStatus !== 200) return route.fulfill({ status: mock.listStatus, json: { error: 'The server could not list proposals.' } });
  return route.fulfill({ json: mock.views.map(summaryOf) });
}

async function act(route: Route, mock: ProposalsMock, view: ProposalView, action?: string) {
  if (!action) return route.fulfill({ json: view });
  if (action === 'diff')
    return route.fulfill({ json: { path: 'sales.ontology.yaml', before: 'name: Sales\n', after: 'name: Sales\n# changed\n', binary: false, beforeExists: true, afterExists: true } });
  if (action === 'promotion-check') return route.fulfill({ json: mock.check });
  if (action === 'work') return route.fulfill({ json: { branch: 'work/alice.rename-customer', head: view.tip } });
  if (action === 'synchronize') return route.fulfill({ json: { merged: true, head: view.tip } });
  if (action === 'promote') {
    view.status = 'promoted';
    view.may = { contribute: false, promote: false, close: false, restore: false };
    return route.fulfill({ json: { published: 'main', previous: 'c'.repeat(40), commit: view.tip } });
  }
  if (action === 'close' || action === 'restore') {
    view.status = action === 'close' ? 'closed' : 'open';
    view.may = { contribute: action === 'restore', promote: false, close: action === 'restore', restore: action === 'close' };
  }
  return route.fulfill({ json: view });
}

/** Bundles the harness in a separate process, as the Admin harness does. */
export async function buildProposalsHarness(): Promise<{ script: string; style: string }> {
  const outdir = await mkdtemp(join(tmpdir(), 'proposals-harness-'));
  try {
    const build = Bun.spawnSync([process.execPath, 'build', 'tests/harness/proposals-harness.tsx', '--target=browser', '--outdir', outdir, '--define', 'process.env.NODE_ENV="development"'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (build.exitCode !== 0) throw new Error(build.stderr.toString());
    const files = await readdir(outdir);
    const style = (await Promise.all(files.filter(file => file.endsWith('.css')).map(file => Bun.file(join(outdir, file)).text()))).join('\n');
    return { script: await Bun.file(join(outdir, 'proposals-harness.js')).text(), style };
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
}

/** Opens the harness page with every request answered by the mock; the bundle is built once per process. */
let bundle: Promise<{ script: string; style: string }> | undefined;
export async function openProposalsHarness(page: Page, mock: ProposalsMock) {
  bundle ??= buildProposalsHarness();
  const { script, style } = await bundle;
  await page.addInitScript(`window.__harness = ${JSON.stringify(HARNESS_PROJECTS)};`);
  await page.route(PROPOSALS_HARNESS_URL + '**', route => respond(route, mock));
  await page.goto(PROPOSALS_HARNESS_URL);
  await page.addStyleTag({ content: style });
  await page.addScriptTag({ content: script, type: 'module' });
}
