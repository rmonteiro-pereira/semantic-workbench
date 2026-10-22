import { parseArgs } from 'node:util';
import { waitUntil, isConnectionRetry } from './helpers/processes';

/** Image metadata expected from the deployed commit or restored image labels. */
export type SmokeExpected = { version: string; commit: string };
/** Responses collected without following an authentication redirect. */
export type SmokeInput = {
  ready: { status: number; body: unknown };
  health: { status: number; body: unknown };
  projects: { status: number; body: unknown };
  home: Response;
  login: Response;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function authorizationRedirect(response: Response, endpoint: string): boolean {
  if (response.status !== 302) return false;
  try {
    const location = new URL(response.headers.get('location') ?? '');
    const authorization = new URL(endpoint);
    return (
      location.origin === authorization.origin &&
      location.pathname === authorization.pathname &&
      location.searchParams.get('code_challenge_method') === 'S256'
    );
  } catch {
    return false;
  }
}

/** Evaluates the smoke contract without network access or clock dependencies. */
export function smokeChecks(
  input: SmokeInput,
  expected: SmokeExpected,
  endpoint: string,
  loopback: boolean,
) {
  const ready = record(input.ready.body);
  const health = record(input.health.body);
  const projects = record(input.projects.body);
  const headers = input.login.headers;
  const cookie = headers
    .getSetCookie()
    .find(
      value =>
        value.startsWith(`${loopback ? 'sw-auth' : '__Host-sw-auth'}=`) ||
        value.startsWith('__Host-sw-auth='),
    );
  return [
    {
      name: 'ready',
      ok: input.ready.status === 200 && ready.ready === true && ready.state === 'serving',
    },
    { name: 'version', ok: input.health.status === 200 && health.version === expected.version },
    { name: 'commit', ok: input.health.status === 200 && health.commit === expected.commit },
    {
      name: 'anonymous API',
      ok:
        input.projects.status === 401 &&
        Object.keys(projects).length === 1 &&
        ['sign-in required', 'Unauthorized'].includes(String(projects.error)),
    },
    { name: 'home redirect', ok: authorizationRedirect(input.home, endpoint) },
    { name: 'login PKCE redirect', ok: authorizationRedirect(input.login, endpoint) },
    { name: 'HSTS', ok: loopback || !!headers.get('strict-transport-security') },
    { name: 'CSP', ok: !!headers.get('content-security-policy') },
    { name: 'nosniff', ok: headers.get('x-content-type-options') === 'nosniff' },
    {
      name: 'state cookie',
      ok:
        !!cookie &&
        /;\s*HttpOnly(?:;|$)/i.test(cookie) &&
        (loopback || /;\s*Secure(?:;|$)/i.test(cookie)),
    },
  ];
}

/** The provider to discover, whether loopback relaxations apply, and the HTTP client to use. */
export type SmokeOptions = { issuer: string; loopback?: boolean; request?: typeof fetch };

/** Calls public probes and discovery, waiting at most three minutes for serving. */
export async function smoke(publicUrl: string, expected: SmokeExpected, options: SmokeOptions) {
  const { issuer, loopback = false, request = fetch } = options;
  const origin = new URL(publicUrl);
  if (loopback && !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) {
    throw Error('--loopback requires a loopback public URL');
  }
  if (!loopback && origin.protocol !== 'https:') throw Error('Smoke requires HTTPS');
  const get = (url: string) =>
    request(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  const json = async (path: string) => {
    const response = await get(`${origin.origin}${path}`);
    return { status: response.status, body: await response.json() };
  };
  let ready: SmokeInput['ready'] = { status: 503, body: {} };
  await waitUntil(
    'smoke serving state',
    async () => {
      try {
        ready = await json('/readyz');
        return ready.status === 200 && record(ready.body).state === 'serving';
      } catch (error) {
        if (isConnectionRetry(error)) return false;
        throw error;
      }
    },
    180_000,
  );
  const discovery = await get(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
  if (!discovery.ok) throw Error(`Discovery returned ${discovery.status}`);
  const endpoint = record(await discovery.json()).authorization_endpoint;
  if (typeof endpoint !== 'string') throw Error('Discovery lacks authorization_endpoint');
  const input = {
    ready,
    health: await json('/healthz'),
    projects: await json('/api/projects'),
    home: await get(`${origin.origin}/`),
    login: await get(`${origin.origin}/auth/login`),
  };
  const checks = smokeChecks(input, expected, endpoint, loopback);
  return { ok: checks.every(check => check.ok), checks };
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2).filter(arg => arg !== '--'),
    allowPositionals: true,
    options: { loopback: { type: 'boolean' }, help: { type: 'boolean' } },
  });
  if (values.help) {
    console.log('deploy:smoke <public-url> <package-version> <commit> [--loopback]');
    console.log('SW_OIDC_ISSUER supplies discovery; --loopback relaxes only HSTS and Secure.');
    return;
  }
  if (positionals.length !== 3 || !process.env.SW_OIDC_ISSUER) {
    throw Error('Expected public URL, package version, commit and SW_OIDC_ISSUER');
  }
  const [url, version, commit] = positionals;
  const result = await smoke(
    url,
    { version, commit },
    { issuer: process.env.SW_OIDC_ISSUER, loopback: values.loopback },
  );
  for (const check of result.checks) console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`);
  console.log(JSON.stringify(result));
  if (!result.ok) throw Error('Deployment smoke failed');
}

if (import.meta.main) {
  await main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
  });
}
