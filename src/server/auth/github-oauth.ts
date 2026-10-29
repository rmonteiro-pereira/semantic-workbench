// GitHub's OAuth endpoints, used alike by an OAuth app and by a GitHub App's user tokens: the
// consent address the browser is sent to, and the token requests made from the server.
import { isLoopbackHost, type ServerConfig } from '../config';

/** The web origin of a GitHub host; plain HTTP only for a loopback stand-in. */
export function githubOrigin(host: string) {
  const name = host.replace(/:\d+$/, '');
  return (isLoopbackHost(name) ? 'http://' : 'https://') + host;
}

/** A configured GitHub app. */
export type GitHubApp = NonNullable<ServerConfig['github']>;

/** What the OAuth client needs: the public origin, the clock and the HTTP client. */
export type GitHubOAuthOptions = { publicUrl: string; now: () => number; fetch?: typeof fetch };

/** Creates the OAuth client; each call names the GitHub app it is for. */
export function githubOAuth(options: GitHubOAuthOptions) {
  const send = options.fetch ?? fetch;
  const now = options.now;
  const callback = options.publicUrl + '/auth/github/callback';
  return {
    authorizeUrl(app: GitHubApp, state: string) {
      const url = new URL('/login/oauth/authorize', githubOrigin(app.host));
      url.searchParams.set('client_id', app.clientId);
      url.searchParams.set('redirect_uri', callback);
      url.searchParams.set('state', state);
      url.searchParams.set('scope', 'repo');
      return url.href;
    },
    async request(app: GitHubApp, parameters: Record<string, string>) {
      const response = await send(new URL('/login/oauth/access_token', githubOrigin(app.host)), {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new URLSearchParams({
          client_id: app.clientId,
          client_secret: app.clientSecret,
          ...parameters,
        }),
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok || typeof body.access_token !== 'string') {
        const code = typeof body.error === 'string' ? `, ${body.error}` : '';
        throw new Error(`GitHub token request failed (${response.status}${code}).`);
      }
      const lifetime = body.expires_in;
      const expiresAt = typeof lifetime === 'number' && lifetime > 0 ? now() + lifetime * 1000 : undefined;
      const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : undefined;
      return { host: app.host, token: body.access_token, expiresAt, refreshToken };
    },
  };
}
