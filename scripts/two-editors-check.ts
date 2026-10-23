// Two signed-in Editors work on one repository at once through the built application: each one's
// edits, drafts, branches, commits and pulls stay in their own working copy, commits carry their
// names, and a Steward's publish reaches a Viewer of Sales.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium, expect, type Browser, type Page } from '@playwright/test';
import { principalKey } from '../server/auth/principal';
import {
  TEST_GROUPS,
  TEST_TENANT_ID,
  TEST_USERS,
  type TestUserName,
} from '../tests/helpers/auth-identities';
import { startMockOidc } from '../tests/helpers/mock-oidc';
import { freeAuthPort, startAuthApi } from './auth-environment';
import { authGeometry, check, signIn, type SignInTarget } from './helpers/sign-in';

const PROJECT = 'sales-contracts';
const ORDERS = 'orders.odcs.yaml';
const MAPPING = 'sales.mapping.yaml';

/** A person signed in in their own browser context, with API calls carrying their session. */
type Person = {
  username: TestUserName;
  page: Page;
  call: (path: string, method?: string, body?: unknown) => Promise<{ status: number; body: any }>;
};

async function signedIn(browser: Browser, target: SignInTarget, username: TestUserName) {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Carol's groups were narrowed to Sales Viewers for this check.
  const viewer = {
    roleId: 'viewer',
    name: 'Viewer',
    via: 'group' as const,
    reason: 'Sales Viewer',
  };
  await signIn(page, target, username, username === 'carol' ? viewer : undefined);
  const call: Person['call'] = async (path, method = 'GET', body) => {
    const response = await context.request.fetch(target.url + path, {
      method,
      headers: { Origin: target.url, 'X-SW-Request': '1' },
      ...(body === undefined ? {} : { data: body }),
    });
    const text = await response.text();
    return { status: response.status(), body: text ? JSON.parse(text) : null };
  };
  return { username, page, call } satisfies Person;
}

const projectApi = (path: string) => `/api/projects/${PROJECT}/${path}`;

async function readSource(person: Person, path: string): Promise<string> {
  const file = await person.call(projectApi(`files/${path}`));
  assert.equal(file.status, 200, `${person.username} reads ${path}`);
  return file.body.source;
}

async function appendLine(person: Person, path: string, line: string) {
  const file = await person.call(projectApi(`files/${path}`));
  const saved = await person.call(projectApi(`files/${path}`), 'PUT', {
    baseHash: file.body.hash,
    source: `${file.body.source}# ${line}\n`,
  });
  assert.equal(saved.status, 200, `${person.username} saves ${path}`);
}

async function commitFile(person: Person, path: string, message: string) {
  assert.equal((await person.call(projectApi('git/stage'), 'POST', { paths: [path] })).status, 200);
  const committed = await person.call(projectApi('git/commit'), 'POST', { message });
  assert.equal(committed.status, 200, `${person.username} commits ${path}`);
}

const branchOf = async (person: Person) => (await person.call(projectApi('git/status'))).body;

async function openSourceControl(person: Person) {
  await person.page.getByRole('button', { name: 'Source control', exact: false }).click();
  // Every person here reads more than one project, so the panel offers a project chooser.
  await person.page.getByRole('combobox', { name: 'Project', exact: true }).selectOption(PROJECT);
  const branch = person.page.getByRole('combobox', { name: 'Branch', exact: true });
  await expect(branch).toHaveValue((await branchOf(person)).branch);
}

// Last commit of a person's copy as Git records it on disk: author, committer and trailer.
function lastCommit(root: string, username: TestUserName) {
  const id = `${TEST_TENANT_ID}:${TEST_USERS[username].oid}`;
  const copy = join(root, 'worktrees', principalKey(id), PROJECT);
  const format = '--format=%an|%cn|%(trailers:key=Signed-in-user,valueonly,separator=)';
  const result = Bun.spawnSync(['git', 'log', '-1', format], { cwd: copy });
  const [author, committer, trailer] = result.stdout.toString().trim().split('|');
  return { author, committer, trailer, id };
}

async function editsStayPersonal(alice: Person, frank: Person) {
  await appendLine(alice, ORDERS, 'alice edits orders');
  await appendLine(frank, MAPPING, 'frank edits the mapping');
  const draft = `/api/drafts/${PROJECT}/people.mapping.yaml`;
  const saved = await alice.call(draft, 'PUT', {
    baseHash: null,
    text: 'alice draft',
    patches: [],
  });
  assert.equal(saved.status, 200);
  assert(!(await readSource(frank, ORDERS)).includes('alice edits orders'));
  assert(!(await readSource(alice, MAPPING)).includes('frank edits the mapping'));
  assert.deepEqual((await frank.call('/api/drafts')).body, []);
  const frankChanges = (await branchOf(frank)).changes.map((change: any) => change.path);
  assert.deepEqual(frankChanges, [MAPPING]);
}

async function branchesStayPersonal(alice: Person, frank: Person) {
  await commitFile(frank, MAPPING, 'Frank edits the mapping');
  await openSourceControl(frank);
  await frank.page.getByRole('button', { name: 'New branch', exact: true }).click();
  await frank.page.getByRole('textbox', { name: 'New branch name' }).fill('feature/frank');
  await frank.page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect.poll(async () => (await branchOf(frank)).branch).toBe('feature/frank');
  const held = frank.page.locator('option', { hasText: 'work/alice (in use by Alice Andrade)' });
  // Playwright does not treat an option as a form control, so the attribute is checked.
  await expect(held).toHaveAttribute('disabled', '');
  const refused = await frank.call(projectApi('git/switch'), 'POST', { branch: 'work/alice' });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.inUseBy, 'Alice Andrade');
  const aliceStatus = await branchOf(alice);
  assert.equal(aliceStatus.branch, 'work/alice');
  assert.deepEqual(
    aliceStatus.changes.map((change: any) => change.path),
    [ORDERS],
  );
}

async function commitsCarryTheirAuthors(root: string, alice: Person, frank: Person) {
  await commitFile(alice, ORDERS, 'Alice edits orders');
  for (const [person, name] of [
    [alice, 'Alice Andrade'],
    [frank, 'Frank Freitas'],
  ] as const) {
    const commit = lastCommit(root, person.username);
    assert.equal(commit.author, name);
    assert.equal(commit.committer, 'Semantic Workbench');
    assert.equal(commit.trailer, commit.id);
  }
  assert.equal((await branchOf(frank)).changes.length, 0);
}

async function publishReachesTheViewer(bob: Person, carol: Person) {
  await appendLine(bob, ORDERS, 'published by bob');
  await commitFile(bob, ORDERS, 'Bob publishes orders');
  await openSourceControl(bob);
  await bob.page.getByRole('button', { name: 'Publish to main', exact: true }).click();
  await expect(bob.page.getByText('Published to main.')).toBeVisible();
  assert((await readSource(carol, ORDERS)).includes('published by bob'));
  const projects = (await carol.call('/api/projects')).body;
  assert.equal(projects.find((project: any) => project.slug === PROJECT).copy, null);
}

async function pullsStayPersonal(alice: Person, frank: Person) {
  await openSourceControl(frank);
  await frank.page.getByRole('button', { name: 'Pull from main', exact: true }).click();
  await expect(frank.page.getByText(/^Pull finished/)).toBeVisible();
  assert((await readSource(frank, ORDERS)).includes('published by bob'));
  assert.equal((await branchOf(frank)).branch, 'feature/frank');
  const aliceOrders = await readSource(alice, ORDERS);
  assert(aliceOrders.includes('alice edits orders'));
  assert(!aliceOrders.includes('published by bob'));
  assert.equal((await branchOf(alice)).branch, 'work/alice');
  assert.equal((await alice.call(`/api/drafts/${PROJECT}/people.mapping.yaml`)).status, 200);
  await authGeometry(frank.page, 'two-editors-source-control');
}

/** Runs the two-person check against its own API and mock identity provider. */
export async function twoEditorsCheck() {
  const url = `http://127.0.0.1:${freeAuthPort()}`;
  const mock = await startMockOidc({
    shape: 'entra',
    layout: 'entra',
    port: 0,
    redirectUris: [url + '/auth/callback'],
    postLogoutRedirectUris: [url + '/auth/signed-out'],
  });
  mock.setUserGroups('carol', [TEST_GROUPS.salesViewers]);
  try {
    const api = await startAuthApi(url, { ...mock, kind: 'entra' });
    try {
      const browser = await chromium.launch({ headless: true });
      try {
        // Entra's authorize endpoint sits beside the issuer, under endpointBase.
        const target: SignInTarget = { url, issuer: mock.endpointBase, kind: 'entra' };
        const [alice, frank, bob, carol] = await Promise.all(
          (['alice', 'frank', 'bob', 'carol'] as const).map(name =>
            signedIn(browser, target, name),
          ),
        );
        await check('edits and drafts stay personal', () => editsStayPersonal(alice, frank));
        await check('branches stay personal', () => branchesStayPersonal(alice, frank));
        await check('commits carry their authors', () =>
          commitsCarryTheirAuthors(api.root, alice, frank),
        );
        await check('a publish reaches the Viewer', () => publishReachesTheViewer(bob, carol));
        await check('pulls stay personal', () => pullsStayPersonal(alice, frank));
      } finally {
        await browser.close();
      }
    } finally {
      await api.stop();
    }
  } finally {
    await mock.stop();
  }
}

if (import.meta.main) await twoEditorsCheck();
