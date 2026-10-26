// Remote Git in server mode: each person's own delegated token for one command, the GitHub
// consent, allowed hosts, Admin-only remote changes, and local mode left as it was.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { useDefaultBrand } from '../helpers/brand-fixture';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixtureFiles } from '../helpers/auth-workspace';
import { TEST_USERS } from '../helpers/auth-identities';
import { testWorkspace } from '../helpers/temp-data-dir';
import {
  AZURE_DEVOPS_AUDIENCE,
  GITHUB_APP,
  MACHINE_HELPER,
  git,
  lastPush,
  origin,
  projectPath,
  startRemoteSetup,
  type RemoteSetup,
} from './remote-setup';
import { repoDir } from '../../src/server/projects/paths';
import { ASKPASS_PROGRAM, credentialSetup, maskToken } from '../../src/server/projects/git';
import {
  AZURE_DEVOPS_HOSTS,
  RemoteHostError,
  allowedRemoteAddresses,
  allowedRemoteHost,
  credentialKind,
} from '../../src/server/auth/remote-hosts';
import { githubUsable } from '../../src/server/auth/remote-credentials';

beforeAll(useDefaultBrand);

let setup: RemoteSetup;
const signIn = (username: string) => setup.signIn(username);
const call = (cookie: string, method: string, path: string, body?: unknown) =>
  setup.call(cookie, method, path, body);

beforeAll(async () => {
  setup = await startRemoteSetup();
});

afterAll(() => setup.stop());

test('an Azure DevOps push uses a token obtained on behalf of the person who pushes', async () => {
  const sales = projectPath('sales-contracts');
  for (const username of ['alice', 'bob'] as const) {
    const cookie = await signIn(username);
    const branch = { branch: `${username}-change`, create: true };
    expect((await call(cookie, 'POST', sales + '/git/switch', branch)).status).toBe(200);
    const pushed = await call(cookie, 'POST', sales + '/git/push');
    expect(pushed.status).toBe(200);
    expect(pushed.body.ok).toBe(true);
    expect(lastPush(setup.azureDevOps)?.identity).toBe(TEST_USERS[username].oid);
  }
  expect(setup.azureDevOps.requests.some(request => request.identity === 'machine')).toBe(false);
  const tokenRequests = setup.provider.calls.filter(
    entry => entry.endpoint === 'token' && entry.params.requested_token_use === 'on_behalf_of',
  );
  // MSAL adds the OpenID Connect scopes to every request; Entra ignores them for this grant.
  const openIdScopes = new Set(['openid', 'profile', 'offline_access']);
  const requested = tokenRequests.map(entry =>
    entry.params.scope
      .split(' ')
      .filter(scope => !openIdScopes.has(scope))
      .join(' '),
  );
  expect(requested).toEqual([
    `${AZURE_DEVOPS_AUDIENCE}/.default`,
    `${AZURE_DEVOPS_AUDIENCE}/.default`,
  ]);
});

test('an Admin clone uses the Admin’s own Azure DevOps token', async () => {
  const dave = await signIn('dave');
  const body = { url: setup.azureDevOpsRemote, name: 'Sales copy', domain: 'sales' };
  const started = await call(dave, 'POST', '/api/clone', body);
  expect(started.status).toBe(200);
  let phase = '';
  for (let attempt = 0; attempt < 500 && !['done', 'failed'].includes(phase); attempt++) {
    const events = setup.fixture.ws.events.replay(0) as { event: string; data: any }[];
    const clone = events.filter(
      event => event.event === 'clone' && event.data.op === started.body.op,
    );
    phase = clone.at(-1)?.data.phase ?? '';
    if (!['done', 'failed'].includes(phase)) await Bun.sleep(10);
  }
  expect(phase).toBe('done');
  const fetches = setup.azureDevOps.requests.filter(request => request.service.includes('upload'));
  expect(fetches.at(-1)?.identity).toBe(TEST_USERS.dave.oid);
});

test('without a connected GitHub account the push asks for consent and then continues', async () => {
  const metrics = projectPath('sales-metrics');
  const alice = await signIn('alice');
  const branch = { branch: 'alice-metrics', create: true };
  expect((await call(alice, 'POST', metrics + '/git/switch', branch)).status).toBe(200);
  const refused = await call(alice, 'POST', metrics + '/git/push');
  expect(refused.status).toBe(428);
  expect(refused.body).toMatchObject({ connect: 'github' });
  expect(setup.github.requests).toHaveLength(0);
  const before = await call(alice, 'GET', '/api/me');
  expect(before.body.connected).toEqual({ azureDevOps: false, github: false });
  expect(before.body.azureDevOpsAvailable).toBe(true);
  expect(before.body.githubConfigured).toBe(true);

  const start = await call(alice, 'GET', '/auth/github/start?returnTo=/catalog?view=scm');
  expect(start.status).toBe(302);
  const authorize = new URL(start.headers.get('location')!);
  expect(authorize.origin + authorize.pathname).toBe(
    setup.github.origin + '/login/oauth/authorize',
  );
  expect(authorize.searchParams.get('client_id')).toBe(GITHUB_APP.clientId);
  expect(authorize.searchParams.get('redirect_uri')).toBe(origin + '/auth/github/callback');
  const state = encodeURIComponent(authorize.searchParams.get('state')!);

  // The state belongs to Alice's session: Bob cannot complete her consent.
  const bob = await signIn('bob');
  const forged = await call(bob, 'GET', `/auth/github/callback?code=any&state=${state}`);
  expect(forged.status).toBe(200);
  expect(forged.text).toContain('could not be connected');

  const token = 'gho_alice_' + crypto.randomUUID().replaceAll('-', '');
  setup.githubTokens.set(token, 'alice');
  setup.github.issueGitHubCode('code-alice', token);
  const finished = await call(alice, 'GET', `/auth/github/callback?code=code-alice&state=${state}`);
  expect(finished.status).toBe(302);
  expect(finished.headers.get('location')).toBe('/catalog?view=scm');
  const replayed = await call(alice, 'GET', `/auth/github/callback?code=code-alice&state=${state}`);
  expect(replayed.text).toContain('could not be connected');
  expect((await call(alice, 'GET', '/api/me')).body.connected.github).toBe(true);

  const pushed = await call(alice, 'POST', metrics + '/git/push');
  expect(pushed.status).toBe(200);
  expect(pushed.body.ok).toBe(true);
  expect(lastPush(setup.github)?.identity).toBe('alice');
  // Bob has not connected GitHub, so Alice's token is never used for him.
  expect((await call(bob, 'POST', metrics + '/git/fetch')).status).toBe(428);
});

test('a failed on-behalf-of exchange asks the person to sign in again', async () => {
  const frank = await signIn('frank');
  const sales = projectPath('sales-contracts');
  const branch = { branch: 'frank-change', create: true };
  expect((await call(frank, 'POST', sales + '/git/switch', branch)).status).toBe(200);
  setup.provider.fail('token', 'error');
  try {
    const refused = await call(frank, 'POST', sales + '/git/push');
    expect(refused.status).toBe(428);
    expect(refused.body).toMatchObject({ connect: 'azure-devops' });
  } finally {
    setup.provider.fail('token', null);
  }
  expect(lastPush(setup.azureDevOps)?.identity).not.toBe(TEST_USERS.frank.oid);
});

test('a separate push address must be on an allowed host too', async () => {
  const sales = repoDir(setup.fixture.ws.layout, 'sales-contracts');
  const alice = await signIn('alice');
  git(sales, ['config', 'remote.origin.pushurl', 'https://gitlab.example.com/team/sales.git']);
  try {
    const refused = await call(alice, 'POST', projectPath('sales-contracts') + '/git/push');
    expect(refused.status).toBe(400);
    expect(refused.body.allowedHosts).toEqual(setup.allowedHosts);
  } finally {
    git(sales, ['config', '--unset', 'remote.origin.pushurl']);
  }
});

test('turning Azure DevOps on-behalf-of off also stops tokens already obtained', async () => {
  const sales = projectPath('sales-contracts');
  const bob = await signIn('bob');
  const branch = { branch: 'bob-switch-off', create: true };
  expect((await call(bob, 'POST', sales + '/git/switch', branch)).status).toBe(200);
  expect((await call(bob, 'POST', sales + '/git/push')).body.ok).toBe(true);
  expect((await call(bob, 'GET', '/api/me')).body.connected.azureDevOps).toBe(true);
  const file = join(setup.fixture.root, 'admin', 'settings.json');
  const before = readFileSync(file, 'utf8');
  const settings = JSON.parse(before);
  settings.remote.azureDevOpsObo = false;
  writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
  try {
    const refused = await call(bob, 'POST', sales + '/git/push');
    expect(refused.status).toBe(400);
    expect(refused.body.error).toContain('turned off');
  } finally {
    writeFileSync(file, before);
  }
});

test('only an Admin changes remotes, clones or registers projects, and only to allowed hosts', async () => {
  const sales = projectPath('sales-contracts');
  const remote = { name: 'origin', url: setup.azureDevOpsRemote };
  for (const username of ['alice', 'bob'] as const) {
    const cookie = await signIn(username);
    expect((await call(cookie, 'PUT', sales + '/git/remote', remote)).status).toBe(403);
    expect((await call(cookie, 'DELETE', sales + '/git/remote', { name: 'origin' })).status).toBe(
      403,
    );
    expect((await call(cookie, 'POST', '/api/clone', { url: remote.url })).status).toBe(403);
    const register = { projects: [{ path: '' }] };
    expect((await call(cookie, 'PUT', '/api/repos/lab-notes/projects', register)).status).toBe(403);
  }
  const dave = await signIn('dave');
  for (const url of [
    'https://gitlab.example.com/team/sales.git',
    'git@github.com:team/sales.git',
    'ssh://git@github.com/team/sales.git',
    'http://github.com/team/sales.git',
    '/srv/elsewhere.git',
  ]) {
    const refused = await call(dave, 'PUT', sales + '/git/remote', { name: 'mirror', url });
    expect(refused.status, url).toBe(400);
    expect(refused.body.allowedHosts).toEqual(setup.allowedHosts);
  }
  const clone = await call(dave, 'POST', '/api/clone', { url: 'https://gitlab.example.com/x.git' });
  expect(clone.status).toBe(400);
  expect(clone.body.allowedHosts).toEqual(setup.allowedHosts);
  git(repoDir(setup.fixture.ws.layout, 'lab-notes'), [
    'remote',
    'add',
    'origin',
    'https://gitlab.example.com/notes.git',
  ]);
  const register = await call(dave, 'PUT', '/api/repos/lab-notes/projects', {
    projects: [{ path: '' }],
  });
  expect(register.status).toBe(400);
  expect(register.body.allowedHosts).toEqual(setup.allowedHosts);
  const remotes = git(repoDir(setup.fixture.ws.layout, 'sales-contracts'), ['remote']);
  expect(remotes.trim()).toBe('origin');
  const audit = setup.auditEntries().filter(entry => entry.action === 'setRemote');
  expect(
    audit.some(
      entry => entry.decision === 'allow' && entry.principal.id.endsWith(TEST_USERS.dave.oid),
    ),
  ).toBe(true);
  expect(audit.filter(entry => entry.decision === 'deny').length).toBeGreaterThanOrEqual(4);
});

test('local mode keeps using the machine’s own Git credentials, with no host allow-list', async () => {
  using local = await testWorkspace();
  const project = await local.seed(fixtureFiles('lab-notes'), 'Local notes');
  git(repoDir(local.ws.layout, project.slug), ['config', 'credential.helper', MACHINE_HELPER]);
  const send = (method: string, path: string, body?: unknown) =>
    local.handler(
      new Request(origin + projectPath(project.slug) + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  const url = setup.azureDevOps.repository('local/_git/notes.git');
  expect((await send('PUT', '/git/remote', { name: 'origin', url })).status).toBe(200);
  const pushed = await send('POST', '/git/push');
  expect(pushed.status).toBe(200);
  expect((await pushed.json()).ok).toBe(true);
  expect(lastPush(setup.azureDevOps)?.identity).toBe('machine');
  const elsewhere = { name: 'mirror', url: 'https://gitlab.example.com/notes.git' };
  expect((await send('PUT', '/git/remote', elsewhere)).status).toBe(200);
  const me = await local.handler(new Request(origin + '/api/me'));
  expect((await me.json()).connected).toEqual({ azureDevOps: false, github: false });
});

test('allowed hosts and the canonical address server mode stores', () => {
  const allowed = ['github.com', '127.0.0.1:9418'];
  const github = allowedRemoteHost('https://GitHub.com/team/a.git', allowed);
  expect(github).toEqual({ host: 'github.com', address: 'https://github.com/team/a.git' });
  expect(allowedRemoteHost('https://github.com/team/a.git', ['GitHub.com']).host).toBe(
    'github.com',
  );
  expect(allowedRemoteHost('http://127.0.0.1:9418/a.git', allowed).host).toBe('127.0.0.1:9418');
  for (const address of [
    'https://gitlab.example.com/a.git',
    'http://github.com/a.git',
    'git@github.com:team/a.git',
    'ext::sh -c touch% /tmp/x',
    'file:///srv/a.git',
    // Git and curl could read these as another host than the URL parser does.
    'https://github.com\\@evil.example/x.git',
    'https://github.com/x@evil.example/x.git',
    'https://u@evil.example@github.com/x.git',
    42,
  ]) {
    expect(() => allowedRemoteHost(address, allowed)).toThrow(RemoteHostError);
  }
  expect(() => allowedRemoteHost('https://me:secret@github.com/a.git', allowed)).toThrow(
    'password',
  );
  const remote = { name: 'origin', fetchUrl: 'https://github.com/a.git', pushUrl: '' };
  expect(allowedRemoteAddresses({ ...remote, pushUrl: remote.fetchUrl }, allowed)).toBe(
    'github.com',
  );
  const elsewhere = { ...remote, pushUrl: 'http://127.0.0.1:9418/a.git' };
  expect(() => allowedRemoteAddresses(elsewhere, allowed)).toThrow('same host');
  // Git prompts with the host as the stored address writes it, so it must be canonical.
  const userAddress = 'https://person@github.com/a.git';
  expect(
    allowedRemoteAddresses({ ...remote, fetchUrl: userAddress, pushUrl: userAddress }, allowed),
  ).toBe('github.com');
  for (const written of ['https://GitHub.com/a.git', 'https://github.com:443/a.git']) {
    const stored = { ...remote, fetchUrl: written, pushUrl: written };
    expect(() => allowedRemoteAddresses(stored, allowed), written).toThrow('save it again');
  }
});

test('credential kinds and usable GitHub tokens', () => {
  const hosts = { github: 'github.com', azureDevOps: AZURE_DEVOPS_HOSTS };
  expect(credentialKind('dev.azure.com', hosts)).toBe('azure-devops');
  expect(credentialKind('contoso.visualstudio.com', hosts)).toBe('azure-devops');
  expect(credentialKind('evilvisualstudio.com', hosts)).toBe('none');
  expect(credentialKind('github.com', hosts)).toBe('github');
  expect(credentialKind('github.com', { ...hosts, github: null })).toBe('none');
  const now = 1_000_000;
  const stored = { host: 'github.com', token: 't' };
  expect(githubUsable(stored, 'github.com', now)).toBe(true);
  expect(githubUsable({ ...stored, expiresAt: now + 3_600_000 }, 'github.com', now)).toBe(true);
  expect(githubUsable({ ...stored, expiresAt: now }, 'github.com', now)).toBe(false);
  const renewable = { ...stored, expiresAt: now, refreshToken: 'r' };
  expect(githubUsable(renewable, 'github.com', now)).toBe(true);
  expect(githubUsable(stored, 'github.example.org', now)).toBe(false);
  expect(githubUsable(undefined, 'github.com', now)).toBe(false);
});

test('the per-command credential handed to Git', () => {
  const credential = {
    kind: 'token' as const,
    username: 'person',
    token: 'secret-token-value',
    host: 'github.com',
  };
  const prepared = credentialSetup(credential);
  expect(prepared.args).toEqual([
    '-c',
    'credential.helper=',
    '-c',
    'http.followRedirects=false',
    '-c',
    'submodule.recurse=false',
    '-c',
    'fetch.recurseSubmodules=false',
    '-c',
    'credential.useHttpPath=false',
    '-c',
    'core.hooksPath=/dev/null',
  ]);
  expect(prepared.env).toEqual({
    GIT_ASKPASS: ASKPASS_PROGRAM,
    SW_GIT_USERNAME: 'person',
    SW_GIT_TOKEN: 'secret-token-value',
    SW_GIT_HOST: 'github.com',
  });
  expect(credentialSetup({ kind: 'none' }).env).toEqual({ GIT_ASKPASS: ASKPASS_PROGRAM });
  expect(maskToken('denied secret-token-value twice secret-token-value', credential)).toBe(
    'denied *** twice ***',
  );
});

test('the askpass program answers only a whole prompt for its own host', () => {
  expect(statSync(ASKPASS_PROGRAM).mode & 0o111).not.toBe(0);
  const env = {
    PATH: process.env.PATH,
    SW_GIT_USERNAME: 'person',
    SW_GIT_TOKEN: 'tok',
    SW_GIT_HOST: 'github.com',
  };
  const ask = (prompt: string) =>
    Bun.spawnSync([ASKPASS_PROGRAM, prompt], { env }).stdout.toString();
  expect(ask("Username for 'https://github.com': ")).toBe('person\n');
  expect(ask("Password for 'https://person@github.com': ")).toBe('tok\n');
  // Any other host, such as a redirect target, or a prompt that only ends in the host gets nothing.
  for (const prompt of [
    "Password for 'https://person@github.com.evil.example': ",
    "Username for 'https://evil.example': ",
    "Password for 'https://u@evil.example/x@github.com': ",
    "Password for 'https://github.com': ",
    "Username for 'https://github.com/path': ",
    "x Username for 'https://github.com': ",
  ]) {
    expect(ask(prompt), prompt).toBe('\n');
  }
  expect(
    Bun.spawnSync([ASKPASS_PROGRAM, "Username for 'https://github.com': "], {
      env: { ...env, SW_GIT_HOST: '' },
    }).stdout.toString(),
  ).toBe('\n');
});
