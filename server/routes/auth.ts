// Renders identity-only pages and routes the browser's authentication lifecycle.
import type { Principal } from '../auth/principal';
import { sessionCookie, type Session } from '../auth/sessions';
import { safeReturnTo } from '../auth/attempts';
import { SignInError, type SignInReason } from '../auth/sign-in-error';
import type { RemoteCredentials } from '../auth/remote-credentials';
import type { Route } from './http';
import { securityHeaders } from '../static';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

type AuthPageOptions = {
  principal?: Principal;
  csrf?: string;
  reason?: string;
  returnTo?: string;
};

type AuthPageKind = 'no-access' | 'signed-out' | 'error' | 'connect-failed';

function pageContent(page: AuthPageKind, options: AuthPageOptions) {
  let title = 'Signed out';
  let content = '<p>You are signed out.</p><a href="/auth/login">Sign in again</a>';
  if (page === 'no-access') {
    title = 'No access';
    const person = options.principal!;
    content =
      '<p>You are signed in as ' +
      escapeHtml(person.name) +
      ' (' +
      escapeHtml(person.verifiedEmail ?? person.username) +
      ').</p>' +
      '<p>An Admin must grant you access to this workbench.</p>' +
      (person.groupsResolved === 'failed' ? '<p>Group membership could not be resolved.</p>' : '') +
      '<form method="post" action="/auth/logout">' +
      '<input type="hidden" name="csrf" value="' +
      escapeHtml(options.csrf ?? '') +
      '">' +
      '<button type="submit">Sign out</button></form>';
  }
  if (page === 'error') {
    title = 'Sign-in error';
    content =
      '<p>' +
      escapeHtml(options.reason ?? 'Provider unreachable') +
      '</p>' +
      '<a href="/auth/login?returnTo=' +
      escapeHtml(encodeURIComponent(safeReturnTo(options.returnTo))) +
      '">Try again</a>';
  }
  if (page === 'connect-failed') {
    title = 'GitHub not connected';
    content =
      '<p>Your GitHub account could not be connected. Nothing was changed.</p>' +
      '<a href="' +
      escapeHtml(safeReturnTo(options.returnTo)) +
      '">Back to the workbench</a>';
  }
  return { title, content };
}

/** Renders minimal authentication pages without scripts or workspace information. */
export function authPage(page: AuthPageKind, options: AuthPageOptions = {}) {
  const { title, content } = pageContent(page, options);
  const headers = securityHeaders();
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<link rel="stylesheet" href="/auth/style.css"><title>' +
      title +
      ' · Semantic Workbench</title></head><body><main><p>Semantic Workbench</p><h1>' +
      title +
      '</h1>' +
      content +
      '</main></body></html>',
    { headers },
  );
}

/** Where the identity provider ends a workbench session after signing the person out. */
export const FRONT_CHANNEL_LOGOUT_PATH = '/auth/front-channel-logout';

/** Dependencies needed by public authentication routes. */
export type AuthRouteOptions = {
  session: (request: Request) => Promise<Session | null>;
  login: (returnTo: string, request?: Request) => Promise<Response>;
  callback: (request: Request) => Promise<Response>;
  logout: (request: Request, session: Session | null) => Promise<Response>;
  /** Ends the sessions of the provider session the request names; carries no cookie. */
  frontChannelLogout: (request: Request) => Promise<Response>;
};

/** The GitHub consent steps of the delegated-credential service. */
export type GitHubConsent = Pick<RemoteCredentials, 'startGitHub' | 'finishGitHub'>;

const gitHubConsentStep = (request: Request, url: URL) =>
  request.method === 'GET' && /^\/auth\/github\/(start|callback)$/.test(url.pathname);

// Connect GitHub: the session that starts the consent is the only one that can complete it.
async function githubRoute(
  request: Request,
  url: URL,
  options: AuthRouteOptions,
  consent?: GitHubConsent,
) {
  const session = await options.session(request);
  if (!session) return options.login(url.pathname + url.search, request);
  if (url.pathname === '/auth/github/start') {
    const location = await consent?.startGitHub(session, url.searchParams.get('returnTo'));
    if (!location) return Response.json({ error: 'GitHub is not configured.' }, { status: 404 });
    return new Response(null, { status: 302, headers: { Location: location } });
  }
  const finished = await consent?.finishGitHub(session, url.searchParams);
  if (!finished) return Response.json({ error: 'GitHub is not configured.' }, { status: 404 });
  if (!finished.connected) return authPage('connect-failed', { returnTo: finished.returnTo });
  return new Response(null, { status: 302, headers: { Location: finished.returnTo } });
}

/** Routes the public pages without exposing any workspace service to their renderers. */
export function createAuthRoutes(options: AuthRouteOptions, consent?: GitHubConsent) {
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/auth/login') {
      return options.login(safeReturnTo(url.searchParams.get('returnTo')), request);
    }
    if (request.method === 'GET' && url.pathname === '/auth/callback') {
      return options.callback(request);
    }
    if (gitHubConsentStep(request, url)) return githubRoute(request, url, options, consent);
    if (request.method === 'GET' && url.pathname === '/auth/signed-out') {
      return authPage('signed-out');
    }
    if (request.method === 'GET' && url.pathname === '/auth/no-access') {
      const session = await options.session(request);
      if (!session) return options.login('/', request);
      if (!session.principal.deactivated && session.principal.grants.length) {
        return new Response(null, { status: 302, headers: { Location: '/' } });
      }
      return authPage('no-access', { principal: session.principal, csrf: session.csrf });
    }
    if (request.method === 'GET' && url.pathname === FRONT_CHANNEL_LOGOUT_PATH) {
      return options.frontChannelLogout(request);
    }
    if (request.method === 'POST' && url.pathname === '/auth/logout') {
      return options.logout(request, await options.session(request));
    }
    if (request.method === 'GET' && url.pathname === '/auth/style.css') {
      return new Response(
        'body{font:1rem system-ui;margin:0;color:#243936;background:#f7f9f9}' +
          'main{box-sizing:border-box;max-width:36rem;margin:8vh auto;padding:1.5rem;' +
          'overflow-wrap:anywhere}button,a{font:inherit;display:inline-flex;' +
          'align-items:center;justify-content:center;gap:8px;padding:9px 13px;' +
          'border:1px solid #dce4e2;border-radius:7px;background:white;color:inherit;' +
          'text-decoration:none;cursor:pointer}button:hover,a:hover{background:#edf5f2}',
        { headers: { 'Content-Type': 'text/css', 'Cache-Control': 'public, max-age=3600' } },
      );
    }
    return null;
  };
}

/** Adapts authentication services to the ordinary HTTP route list. */
export function authRoutes(options: AuthRouteOptions, consent?: GitHubConsent): Route {
  const route = createAuthRoutes(options, consent);
  return (_workspace, request) => route(request);
}

/** Renders only safe sign-in reasons, including failures starting from a protected page. */
export function signInErrorResponse(error: SignInError, publicUrl?: string) {
  const reasons: Record<SignInReason, string> = {
    'tenant-mismatch': 'Tenant mismatch',
    'attempt-invalid': 'Expired or replayed sign-in attempt',
    'token-invalid': 'Invalid or expired provider token',
    'provider-unreachable': 'Provider unreachable',
    'provider-unsupported': 'Not supported by the identity provider',
    'session-upgraded': 'Signed out after an update; sign in again',
  };
  const response = authPage('error', { reason: reasons[error.reason], returnTo: error.returnTo });
  if (publicUrl) response.headers.append('Set-Cookie', sessionCookie('', publicUrl, 'auth', 0));
  return response;
}
