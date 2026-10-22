// A loopback Git HTTP server that refuses every request without a credential it accepts, records
// who each accepted request belongs to, and can stand in for GitHub's OAuth token endpoint.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Decides whose credential a username and password are; null refuses the request. */
export type CredentialCheck = (username: string, password: string) => Promise<string | null>;

/** One request the server accepted: whose credential it carried and which Git service it ran. */
export type GitRequest = { identity: string; service: string; path: string };

/** A running credential-checking Git server with its request history. */
export type CredentialGitServer = {
  host: string;
  origin: string;
  requests: GitRequest[];
  /** Every password presented, accepted or not, so tests can search for them elsewhere. */
  passwords: Set<string>;
  /** Creates an empty bare repository and returns its remote address. */
  repository(name: string): string;
  /** The folder of a repository on this machine, for changing it without the server. */
  folder(name: string): string;
  /** Runs before the server answers each accepted request, so a test can act mid-command. */
  beforeServe(hook: ((request: GitRequest) => void) | null): void;
  /** Lets the OAuth token endpoint answer one code with a token for the given person. */
  issueGitHubCode(code: string, token: string): void;
  /** Makes the next authorization page approve at once, issuing a code for this token. */
  consentAs(token: string): void;
  stop(): Promise<void>;
};

function basicCredential(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator < 0) return null;
  return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}

// Splits the CGI answer of `git http-backend` into its status, headers and body.
function cgiResponse(output: Uint8Array) {
  const text = Buffer.from(output).toString('latin1');
  const end = text.indexOf('\r\n\r\n');
  const headerText = end < 0 ? '' : text.slice(0, end);
  const body = output.slice(end < 0 ? 0 : end + 4);
  const headers = new Headers();
  let status = 200;
  for (const line of headerText.split('\r\n')) {
    const colon = line.indexOf(':');
    const name = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (name.toLowerCase() === 'status') status = Number.parseInt(value, 10);
    else headers.append(name, value);
  }
  return new Response(body, { status, headers });
}

async function httpBackend(root: string, request: Request, identity: string) {
  const url = new URL(request.url);
  const child = Bun.spawn(['git', 'http-backend'], {
    env: {
      ...process.env,
      GIT_PROJECT_ROOT: root,
      GIT_HTTP_EXPORT_ALL: '1',
      PATH_INFO: url.pathname,
      QUERY_STRING: url.search.slice(1),
      REQUEST_METHOD: request.method,
      CONTENT_TYPE: request.headers.get('content-type') ?? '',
      HTTP_CONTENT_ENCODING: request.headers.get('content-encoding') ?? '',
      // A signed-in user may push; http-backend enables receive-pack only then.
      REMOTE_USER: identity,
      REMOTE_ADDR: '127.0.0.1',
    },
    stdin: new Uint8Array(await request.arrayBuffer()),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = new Uint8Array(await new Response(child.stdout).arrayBuffer());
  await child.exited;
  return cgiResponse(output);
}

function gitService(url: URL) {
  return url.searchParams.get('service') ?? url.pathname.split('/').pop() ?? '';
}

/** Starts the server on a free loopback port; repositories live under `root`. */
export function startCredentialGitServer(
  root: string,
  check: CredentialCheck,
  github?: { clientId: string; clientSecret: string; redirectUri: string },
): CredentialGitServer {
  mkdirSync(root, { recursive: true });
  const requests: GitRequest[] = [];
  const passwords = new Set<string>();
  const codes = new Map<string, string>();
  let consent: string | null = null;
  let hookBeforeServe: ((request: GitRequest) => void) | null = null;
  // Stands in for GitHub's consent page: the person approves, and GitHub returns a code.
  function authorizeEndpoint(url: URL) {
    const redirect = url.searchParams.get('redirect_uri') ?? '';
    if (!consent || redirect !== github?.redirectUri) {
      return new Response('No consent prepared', { status: 400 });
    }
    const code = crypto.randomUUID();
    codes.set(code, consent);
    consent = null;
    const back = new URL(redirect);
    back.searchParams.set('code', code);
    back.searchParams.set('state', url.searchParams.get('state') ?? '');
    return Response.redirect(back.href, 302);
  }
  async function tokenEndpoint(request: Request) {
    const form = new URLSearchParams(await request.text());
    const token = codes.get(form.get('code') ?? '');
    codes.delete(form.get('code') ?? '');
    const client =
      form.get('client_id') === github?.clientId &&
      form.get('client_secret') === github?.clientSecret &&
      form.get('redirect_uri') === github?.redirectUri;
    if (!token || !client || request.headers.get('accept') !== 'application/json') {
      return Response.json({ error: 'bad_verification_code' });
    }
    return Response.json({ access_token: token, token_type: 'bearer', scope: 'repo' });
  }
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/login/oauth/access_token' && request.method === 'POST') {
        return tokenEndpoint(request);
      }
      if (url.pathname === '/login/oauth/authorize') return authorizeEndpoint(url);
      const credential = basicCredential(request);
      if (credential) passwords.add(credential.password);
      const identity = credential && (await check(credential.username, credential.password));
      if (!identity) {
        return new Response('Authentication required', {
          status: 401,
          headers: { 'WWW-Authenticate': 'Basic realm="test"' },
        });
      }
      const accepted = { identity, service: gitService(url), path: url.pathname };
      requests.push(accepted);
      hookBeforeServe?.(accepted);
      return httpBackend(root, request, identity);
    },
  });
  const host = `127.0.0.1:${server.port}`;
  return {
    host,
    origin: `http://${host}`,
    requests,
    passwords,
    repository(name: string) {
      const path = join(root, name);
      const created = Bun.spawnSync(['git', 'init', '-q', '--bare', '-b', 'main', path]);
      if (created.exitCode !== 0) throw new Error(created.stderr.toString());
      return `http://${host}/${name}`;
    },
    folder: (name: string) => join(root, name),
    beforeServe(hook) {
      hookBeforeServe = hook;
    },
    issueGitHubCode(code: string, token: string) {
      codes.set(code, token);
    },
    consentAs(token: string) {
      consent = token;
    },
    stop: () => server.stop(true),
  };
}

/**
 * A remote that redirects every request to another host. With `askFirst` it demands a credential
 * before redirecting; otherwise it redirects at once, before Git has offered any credential.
 */
export function startRedirectingServer(target: string, options: { askFirst?: boolean } = {}) {
  const passwords = new Set<string>();
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const credential = basicCredential(request);
      if (credential) passwords.add(credential.password);
      if (options.askFirst && !credential) {
        return new Response('Authentication required', {
          status: 401,
          headers: { 'WWW-Authenticate': 'Basic realm="test"' },
        });
      }
      const url = new URL(request.url);
      return Response.redirect(target + url.pathname + url.search, 302);
    },
  });
  const host = `127.0.0.1:${server.port}`;
  return { host, origin: `http://${host}`, passwords, stop: () => server.stop(true) };
}
