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

// The same layers mark and wordmark as the workspace sidebar, drawn inline because these pages
// carry no scripts and load nothing but their stylesheet.
const BRAND_MARKUP =
  '<div class="brand"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
  'aria-hidden="true"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 ' +
  '3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 ' +
  '3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 ' +
  '3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/></svg><span>semantic' +
  '<small>WORKBENCH</small></span></div>';

// A centred card on the workbench background; text sizes follow the workbench type scale.
const AUTH_STYLESHEET =
  'body{font:0.9375rem/1.5 system-ui,sans-serif;margin:0;color:#243936;background:#f7f9f9;' +
  'min-height:100vh;display:flex;align-items:center;justify-content:center}' +
  'main{box-sizing:border-box;width:min(28rem,calc(100vw - 2rem));margin:1rem;' +
  'padding:1.75rem;background:white;border:1px solid #dce4e2;border-radius:12px;' +
  'box-shadow:0 10px 30px #17323a14;overflow-wrap:anywhere}' +
  '.brand{display:flex;align-items:center;gap:12px;color:#237c68;font-weight:800;' +
  'font-size:1.375rem;margin-bottom:1.25rem}' +
  '.brand small{display:block;font-size:0.75rem;font-weight:600;letter-spacing:3px;' +
  'color:#566c65;margin-top:2px}' +
  'h1{font-size:1.25rem;margin:0 0 0.75rem}p{margin:0 0 0.75rem}' +
  'button,a{font:inherit;display:inline-flex;align-items:center;justify-content:center;' +
  'gap:8px;padding:9px 13px;border:1px solid #dce4e2;border-radius:7px;background:white;' +
  'color:inherit;text-decoration:none;cursor:pointer}button:hover,a:hover{background:#edf5f2}';

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
export function authPage(page: AuthPageKind, options: AuthPageOptions = {}, status = 200) {
  const { title, content } = pageContent(page, options);
  const headers = securityHeaders();
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<link rel="stylesheet" href="/auth/style.css"><title>' +
      title +
      ' · Semantic Workbench</title></head><body><main>' +
      BRAND_MARKUP +
      '<h1>' +
      title +
      '</h1>' +
      content +
      '</main></body></html>',
    { headers, status },
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
      return new Response(AUTH_STYLESHEET, {
        headers: { 'Content-Type': 'text/css', 'Cache-Control': 'public, max-age=3600' },
      });
    }
    return null;
  };
}

/** Adapts authentication services to the ordinary HTTP route list. */
export function authRoutes(options: AuthRouteOptions, consent?: GitHubConsent): Route {
  const route = createAuthRoutes(options, consent);
  return (_workspace, request) => route(request);
}

/** The HTTP status of each sign-in failure page; the other reasons keep a plain page. */
const SIGN_IN_FAILURE_STATUS: Partial<Record<SignInReason, number>> = {
  'attempt-invalid': 400,
  'token-invalid': 400,
  'tenant-mismatch': 400,
  'provider-unreachable': 503,
};

/** Renders only safe sign-in reasons, including failures starting from a protected page. */
export function signInErrorResponse(error: SignInError, publicUrl?: string) {
  const reasons: Record<SignInReason, string> = {
    'tenant-mismatch': 'Tenant mismatch.',
    'attempt-invalid': 'Expired or replayed sign-in attempt.',
    'token-invalid': 'Invalid or expired provider token.',
    'provider-unreachable': 'Provider unreachable.',
    'provider-unsupported': 'Not supported by the identity provider.',
    'session-upgraded': 'Signed out after an update; sign in again.',
  };
  const response = authPage(
    'error',
    { reason: reasons[error.reason], returnTo: error.returnTo },
    SIGN_IN_FAILURE_STATUS[error.reason],
  );
  if (publicUrl) response.headers.append('Set-Cookie', sessionCookie('', publicUrl, 'auth', 0));
  return response;
}
