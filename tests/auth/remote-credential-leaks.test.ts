// A delegated token never leaves the command and host it was issued for: not into files, logs,
// audit or responses, not to a redirect target, and not lost when two requests save at once.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { useDefaultBrand } from '../helpers/brand-fixture';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TEST_USERS } from '../helpers/auth-identities';
import { oidcConfig } from '../helpers/server-auth';
import {
  copyOn,
  MACHINE_SECRET,
  filesUnder,
  git,
  lastPush,
  projectPath,
  publishSalesBranch,
  pushIncoming,
  salesRepositories,
  startRemoteSetup,
  type RemoteSetup,
} from './remote-setup';
import { repoDir } from '../../src/server/projects/paths';
import { createSessionStore } from '../../src/server/auth/sessions';
import { createRemoteCredentials } from '../../src/server/auth/remote-credentials';
import { localPrincipal } from '../../src/server/auth/principal';

beforeAll(useDefaultBrand);

let setup: RemoteSetup;

beforeAll(async () => {
  setup = await startRemoteSetup();
});

afterAll(() => setup.stop());

// Pushes a new branch of a project as one person and returns the response.
async function pushBranch(cookie: string, slug: string) {
  const branch = { branch: 'scan-' + crypto.randomUUID().slice(0, 8), create: true };
  expect((await setup.call(cookie, 'POST', projectPath(slug) + '/git/switch', branch)).status).toBe(
    200,
  );
  return setup.call(cookie, 'POST', projectPath(slug) + '/git/push');
}

// Connects a person's GitHub account through the consent flow with a fresh token.
async function connectGitHub(cookie: string, username: string) {
  const start = await setup.call(cookie, 'GET', '/auth/github/start?returnTo=/');
  const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
  const token = `gho_${username}_` + crypto.randomUUID().replaceAll('-', '');
  setup.githubTokens.set(token, username);
  setup.github.issueGitHubCode('code-' + username, token);
  const path = `/auth/github/callback?code=code-${username}&state=${encodeURIComponent(state)}`;
  expect((await setup.call(cookie, 'GET', path)).status).toBe(302);
  return token;
}

test('no token reaches Git configuration, data files, logs, audit or responses', async () => {
  const frank = await setup.signIn('frank');
  const azurePush = await pushBranch(frank, 'sales-contracts');
  expect(azurePush.body.ok).toBe(true);
  expect(lastPush(setup.azureDevOps)?.identity).toBe(TEST_USERS.frank.oid);
  const bob = await setup.signIn('bob');
  const githubToken = await connectGitHub(bob, 'bob');
  const githubPush = await pushBranch(bob, 'sales-metrics');
  expect(githubPush.body.ok).toBe(true);
  expect(lastPush(setup.github)?.identity).toBe('bob');

  const tokens = [...setup.azureDevOps.passwords, ...setup.github.passwords, githubToken].filter(
    token => token !== MACHINE_SECRET,
  );
  expect(tokens).toContain(githubToken);
  expect(tokens.length).toBeGreaterThanOrEqual(2);
  expect(existsSync(join(setup.fixture.root, 'state', 'stored-credentials'))).toBe(false);
  const layout = setup.fixture.ws.layout;
  const configs = ['sales-contracts', 'sales-metrics'].map(slug =>
    readFileSync(join(repoDir(layout, slug), '.git', 'config'), 'utf8'),
  );
  const files = filesUnder(setup.fixture.root).map(path => readFileSync(path).toString('latin1'));
  const record = [
    setup.logs.join('\n'),
    setup.responses.join('\n'),
    JSON.stringify(setup.auditEntries()),
  ];
  for (const token of tokens) {
    for (const config of configs) expect(config.includes(token)).toBe(false);
    expect(files.some(text => text.includes(token))).toBe(false);
    for (const text of record) expect(text.includes(token)).toBe(false);
  }
});

test('a remote that redirects elsewhere never passes the token on, and the push fails', async () => {
  const dave = await setup.signIn('dave');
  const pushed = await pushBranch(dave, 'hr-people');
  expect(pushed.status).toBe(200);
  expect(pushed.body.ok).toBe(false);
  expect(pushed.body.stderr).toContain('302');
  // The host it redirected to received no request and no credential at all.
  expect(setup.elsewhere.requests).toHaveLength(0);
  expect(setup.elsewhere.passwords.size).toBe(0);
  const tokens = [...setup.azureDevOps.passwords].filter(token => token !== MACHINE_SECRET);
  for (const token of tokens) expect(pushed.text.includes(token)).toBe(false);
});

test('a filter the repository configures never sees the token while a pull merges', async () => {
  const alice = await setup.signIn('alice');
  const clone = await publishSalesBranch(setup, alice, 'filter-scan');
  const { local } = salesRepositories(setup);
  // The smudge filter records its environment each time Git checks out a matching file.
  const seen = join(setup.gitRoot, 'filter-environment');
  git(local, ['config', 'filter.spy.smudge', `env > '${seen}'; cat`]);
  writeFileSync(join(local, '.git', 'info', 'attributes'), '*.scan filter=spy\n');
  try {
    pushIncoming(clone, 'pulled.scan', () => 'Checked out through the filter.\n');
    const pulled = await setup.call(alice, 'POST', projectPath('sales-contracts') + '/git/pull');
    expect(pulled.body.ok).toBe(true);
    // The pull ran in Alice's own working copy.
    expect(existsSync(join(copyOn(setup, 'filter-scan'), 'pulled.scan'))).toBe(true);
    const environment = readFileSync(seen, 'utf8');
    expect(environment).not.toContain('SW_GIT_TOKEN');
    expect(setup.azureDevOps.passwords.size).toBeGreaterThan(0);
    for (const token of setup.azureDevOps.passwords) {
      expect(environment.includes(token)).toBe(false);
    }
  } finally {
    git(local, ['config', '--remove-section', 'filter.spy']);
    rmSync(join(local, '.git', 'info', 'attributes'), { force: true });
  }
});

test('two requests of one session that obtain tokens at once keep both tokens', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'workbench-remote-sessions-'));
  try {
    const sessions = createSessionStore({ dir, key: new Uint8Array(32).fill(7) });
    const created = await sessions.create({
      principal: localPrincipal(),
      tokens: { accessToken: 'workbench-access', expiresAt: Date.now() + 3_600_000 },
    });
    const expired = { host: 'github.example', token: 'gh-old', expiresAt: 1, refreshToken: 'r1' };
    await sessions.updateRemote(created.id, () => ({ github: expired }));
    // Each request holds its own copy of the session, read before either token arrives.
    const copies = [(await sessions.get(created.id))!, (await sessions.get(created.id))!];
    let refreshes = 0;
    const credentials = createRemoteCredentials({
      config: oidcConfig('http://127.0.0.1:9/issuer', 'http://127.0.0.1:9/graph', 'entra', {
        SW_GITHUB_HOST: 'github.example',
        SW_GITHUB_CLIENT_ID: 'client',
        SW_GITHUB_CLIENT_SECRET: 'secret',
      }),
      client: {
        onBehalfOf: async () => {
          await Bun.sleep(30);
          return { token: 'ado-new', expiresAt: Date.now() + 3_600_000 };
        },
      },
      session: async request => copies[Number(request.headers.get('x-copy'))],
      sessions,
      settings: () => ({
        session: { idleHours: 8, absoluteHours: 24 },
        remote: { allowedHosts: ['dev.azure.com', 'github.example'], azureDevOpsObo: true },
      }),
      log: () => {},
      fetch: (async () => {
        refreshes++;
        await Bun.sleep(10);
        return Response.json({ access_token: 'gh-new', expires_in: 3600, refresh_token: 'r2' });
      }) as unknown as typeof fetch,
    });
    const request = (copy: number) =>
      new Request('http://127.0.0.1:4310/', { headers: { 'x-copy': String(copy) } });
    const [azure, github, again] = await Promise.all([
      credentials.credentialFor(request(0), 'dev.azure.com'),
      credentials.credentialFor(request(1), 'github.example'),
      credentials.credentialFor(request(0), 'github.example'),
    ]);
    expect(azure).toMatchObject({ token: 'ado-new', host: 'dev.azure.com' });
    expect(github).toMatchObject({ token: 'gh-new', host: 'github.example' });
    expect(again).toMatchObject({ token: 'gh-new' });
    // A GitHub refresh token works once, so one renewal serves both requests.
    expect(refreshes).toBe(1);
    const stored = (await sessions.get(created.id))!.remote!;
    expect(stored.azureDevOps?.token).toBe('ado-new');
    expect(stored.github?.token).toBe('gh-new');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('two callbacks with the same consent state connect at most once', async () => {
  const hank = await setup.signIn('hank');
  const start = await setup.call(hank, 'GET', '/auth/github/start?returnTo=/');
  const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
  for (const code of ['race-one', 'race-two']) {
    const token = `gho_${code}_` + crypto.randomUUID().replaceAll('-', '');
    setup.githubTokens.set(token, 'hank');
    setup.github.issueGitHubCode(code, token);
  }
  const callback = (code: string) =>
    setup.call(
      hank,
      'GET',
      `/auth/github/callback?code=${code}&state=${encodeURIComponent(state)}`,
    );
  const answers = await Promise.all([callback('race-one'), callback('race-two')]);
  expect(answers.map(answer => answer.status).sort()).toEqual([200, 302]);
});
