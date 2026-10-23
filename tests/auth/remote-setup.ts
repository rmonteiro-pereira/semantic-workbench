// A server-mode workspace whose remotes are credential-checking Git servers on loopback: one
// stands in for Azure DevOps, one for GitHub, and one redirects to a host that must never see a
// token. Requests, responses and console output are kept for leak scans.
import { expect, spyOn, type Mock } from 'bun:test';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { startMockOidc, type MockOidc } from '../helpers/mock-oidc';
import { authWorkspace } from '../helpers/auth-workspace';
import { oidcConfig } from '../helpers/server-auth';
import {
  startCredentialGitServer,
  startRedirectingServer,
  type CredentialGitServer,
} from './credential-git-server';
import { createServerAuthentication } from '../../server/auth/authentication';
import { createHandler } from '../../server/handler';
import { repoDir } from '../../server/projects/paths';
import { parseWorktreeList } from '../../server/projects/worktrees';

/** The public origin of the workbench under test. */
export const origin = 'http://127.0.0.1:4310';
/** The resource whose tokens the Azure DevOps stand-in accepts. */
export const AZURE_DEVOPS_AUDIENCE = '499b84ac-1321-427f-aa17-267ca6975798';
/** The GitHub app the workbench is configured with. */
export const GITHUB_APP = { clientId: 'sw-github-test', clientSecret: 'github-app-secret-value' };
/** The machine's own credential, which only local mode may use. */
export const MACHINE_SECRET = 'machine-credential-secret';
/** A credential helper answering with the machine's own credential. */
export const MACHINE_HELPER =
  '!f() { test "$1" = get && printf "username=machine\\npassword=' + MACHINE_SECRET + '\\n"; }; f';

/** Runs Git directly, outside the workbench, and returns its output. */
export function git(dir: string, args: string[]) {
  const result = Bun.spawnSync(['git', ...args], { cwd: dir });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString();
}

/** The API path of a project. */
export const projectPath = (slug: string) => `/api/projects/${slug}`;

/** The last push a stand-in server accepted. */
export function lastPush(server: CredentialGitServer) {
  return server.requests.filter(request => request.service === 'git-receive-pack').at(-1);
}

/** Every file below a folder, without following links. */
export function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    const stat = lstatSync(path);
    if (stat.isDirectory()) return filesUnder(path);
    return stat.isFile() ? [path] : [];
  });
}

function writeSettings(root: string, allowedHosts: string[]) {
  const settings = {
    formatVersion: 1,
    session: { idleHours: 8, absoluteHours: 24 },
    remote: { allowedHosts, azureDevOpsObo: true, github: { host: 'github.com' } },
    audit: { retentionDays: 400 },
  };
  writeFileSync(join(root, 'admin', 'settings.json'), JSON.stringify(settings, null, 2) + '\n');
}

async function startServers(gitRoot: string, provider: MockOidc) {
  const keys = createRemoteJWKSet(new URL(provider.issuer + '/keys'));
  // Azure DevOps accepts a token the provider issued for its resource, and names its owner.
  const azureDevOps = startCredentialGitServer(join(gitRoot, 'ado'), async (_user, password) => {
    if (password === MACHINE_SECRET) return 'machine';
    try {
      const options = { issuer: provider.issuer, audience: AZURE_DEVOPS_AUDIENCE };
      return String((await jwtVerify(password, keys, options)).payload.oid);
    } catch {
      return null;
    }
  });
  const githubTokens = new Map<string, string>();
  const github = startCredentialGitServer(
    join(gitRoot, 'github'),
    async (_user, password) => githubTokens.get(password) ?? null,
    { ...GITHUB_APP, redirectUri: origin + '/auth/github/callback' },
  );
  // The redirect target accepts nobody; it only records what reaches it.
  const elsewhere = startCredentialGitServer(join(gitRoot, 'elsewhere'), async () => null);
  const redirecting = startRedirectingServer(elsewhere.origin);
  return { azureDevOps, github, githubTokens, elsewhere, redirecting };
}

// Keeps everything the console prints, so a test can prove no token was logged.
function captureLogs(logs: string[]) {
  return (['log', 'error', 'warn', 'info'] as const).map(method =>
    spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    }),
  ) as Mock<(...args: unknown[]) => void>[];
}

// Signs people in through the provider and sends their requests, keeping each response text.
function personRequests(
  handler: ReturnType<typeof createHandler>,
  provider: MockOidc,
  responses: string[],
) {
  async function signIn(username: string) {
    const first = await handler(new Request(origin + '/'));
    const attempt = first.headers.getSetCookie()[0].split(';')[0];
    const callback = await provider.authorizeAs(username, first.headers.get('location')!);
    const signedIn = await handler(new Request(callback, { headers: { Cookie: attempt } }));
    const session = signedIn.headers.getSetCookie().find(value => value.startsWith('sw-session='));
    return session!.split(';')[0];
  }

  // Sends one request as a signed-in person and keeps the response text for leak scans.
  async function call(cookie: string, method: string, path: string, body?: unknown) {
    const headers = { Cookie: cookie, Origin: origin, 'X-SW-Request': '1' };
    const response = await handler(
      new Request(origin + path, {
        method,
        headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    const text = await response.text();
    responses.push(text, JSON.stringify([...response.headers]));
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: response.status, headers: response.headers, body: json, text };
  }
  return { signIn, call };
}

/** Starts the provider, the stand-in remotes and the workbench, with remotes set by the Admin. */
export async function startRemoteSetup() {
  const logs: string[] = [];
  const responses: string[] = [];
  const spies = captureLogs(logs);
  const provider = await startMockOidc();
  const fixture = await authWorkspace();
  const gitRoot = mkdtempSync(join(tmpdir(), 'workbench-remote-credentials-'));
  const servers = await startServers(gitRoot, provider);
  const { azureDevOps, github, redirecting } = servers;
  const allowedHosts = ['dev.azure.com', 'github.com', azureDevOps.host, github.host];
  allowedHosts.push(redirecting.host);
  writeSettings(fixture.root, allowedHosts);
  const config = oidcConfig(provider.issuer, provider.graphUrl, 'entra', {
    SW_GITHUB_HOST: github.host,
    SW_GITHUB_CLIENT_ID: GITHUB_APP.clientId,
    SW_GITHUB_CLIENT_SECRET: GITHUB_APP.clientSecret,
  });
  const auth = await createServerAuthentication(fixture.ws, config, undefined, {
    azureDevOpsHosts: [azureDevOps.host, redirecting.host],
  });
  const handler = createHandler(fixture.ws, auth);

  const { signIn, call } = personRequests(handler, provider, responses);

  function auditEntries() {
    const dir = join(fixture.root, 'state', 'audit');
    return readdirSync(dir)
      .filter(name => name.endsWith('.jsonl'))
      .flatMap(name => readFileSync(join(dir, name), 'utf8').split('\n').filter(Boolean))
      .map(line => JSON.parse(line));
  }

  async function stop() {
    for (const spy of spies) spy.mockRestore();
    auth.close();
    fixture.dispose();
    for (const server of [azureDevOps, github, servers.elsewhere, redirecting]) await server.stop();
    await provider.stop();
    rmSync(gitRoot, { recursive: true, force: true });
  }

  const setup = {
    ...servers,
    provider,
    fixture,
    auth,
    handler,
    allowedHosts,
    gitRoot,
    azureDevOpsRemote: azureDevOps.repository('org/_git/sales.git'),
    logs,
    responses,
    signIn,
    call,
    auditEntries,
    stop,
  };
  await prepareRemotes(setup);
  return setup;
}

/** The running setup of the remote-credential tests. */
export type RemoteSetup = Awaited<ReturnType<typeof startRemoteSetup>>;

/** The Sales repository on the workbench's side and its Azure DevOps remote's folder. */
export function salesRepositories(setup: RemoteSetup) {
  return {
    local: repoDir(setup.fixture.ws.layout, 'sales-contracts'),
    remote: setup.azureDevOps.folder('org/_git/sales.git'),
  };
}

/**
 * Creates a branch of Sales as a person, places it on the remote without the workbench, and
 * returns a clone of it in which a test prepares incoming commits.
 */
export async function publishSalesBranch(setup: RemoteSetup, cookie: string, branch: string) {
  const switched = await setup.call(
    cookie,
    'POST',
    projectPath('sales-contracts') + '/git/switch',
    {
      branch,
      create: true,
    },
  );
  expect(switched.status).toBe(200);
  const { local, remote } = salesRepositories(setup);
  git(local, ['push', '-q', remote, `${branch}:${branch}`]);
  // The branch tracks its remote copy, so a sync pulls before it pushes.
  git(local, ['config', `branch.${branch}.remote`, 'origin']);
  git(local, ['config', `branch.${branch}.merge`, `refs/heads/${branch}`]);
  // Inside the stand-in servers' folder, which the setup removes when it stops.
  const clone = mkdtempSync(join(setup.gitRoot, 'incoming-'));
  git(clone, ['clone', '-q', '-b', branch, remote, '.']);
  return clone;
}

/**
 * The working copy that has a branch checked out: in server mode each person's Git actions run in
 * their own copy of the repository, not in the published checkout.
 */
export function copyOn(setup: RemoteSetup, branch: string) {
  const { local } = salesRepositories(setup);
  const listing = git(local, ['worktree', 'list', '--porcelain']);
  const entry = parseWorktreeList(listing).find(copy => copy.branch === branch);
  if (!entry) throw new Error(`No working copy has ${branch} checked out.`);
  return entry.path;
}

/** Commits one file change in a clone and pushes it straight to the remote's folder. */
export function pushIncoming(clone: string, path: string, text: (current: string) => string) {
  const file = join(clone, path);
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  writeFileSync(file, text(current));
  git(clone, ['add', path]);
  const author = ['-c', 'user.name=Remote', '-c', 'user.email=remote@example.invalid'];
  git(clone, [...author, 'commit', '-qm', 'Incoming ' + path]);
  git(clone, ['push', '-q', 'origin', 'HEAD']);
  return git(clone, ['rev-parse', 'HEAD']).trim();
}

/** The path of a file inside the clone of a Sales repository, found by its name. */
export function salesFile(clone: string, name: string) {
  const found = git(clone, ['ls-files'])
    .split('\n')
    .find(path => path === name || path.endsWith('/' + name));
  if (!found) throw new Error(name + ' is not in the Sales repository.');
  return found;
}

// A machine credential helper and a storing helper in the repository must both be ignored, and
// the Admin points Sales at Azure DevOps and Sales metrics at GitHub.
async function prepareRemotes(setup: RemoteSetup) {
  const sales = repoDir(setup.fixture.ws.layout, 'sales-contracts');
  git(sales, ['config', '--add', 'credential.helper', MACHINE_HELPER]);
  const store = join(setup.fixture.root, 'state', 'stored-credentials');
  git(sales, ['config', '--add', 'credential.helper', `store --file=${store}`]);
  const dave = await setup.signIn('dave');
  const remotes = [
    ['sales-contracts', setup.azureDevOpsRemote],
    ['sales-metrics', setup.github.repository('team/metrics.git')],
    ['hr-people', setup.redirecting.origin + '/org/_git/people.git'],
  ];
  for (const [slug, url] of remotes) {
    const changed = await setup.call(dave, 'PUT', projectPath(slug) + '/git/remote', {
      name: 'origin',
      url,
    });
    expect(changed.status).toBe(200);
  }
}
