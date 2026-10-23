// Opens server-mode authentication against an in-memory provider and a disposable workspace, and
// signs people in through the real handler.
import { join } from 'node:path';
import { createServerAuthentication } from '../../server/auth/authentication';
import { createOidcClient } from '../../server/auth/oidc';
import type { ServerConfig } from '../../server/config';
import { createHandler } from '../../server/handler';
import type { HandlerOptions } from '../../server/auth/middleware';
import { authWorkspace } from './auth-workspace';
import { oidcTransport } from './oidc-transport';

/** Everything a test needs to drive sign-in, plus cleanup when the test ends. */
export async function signInContext(handlerOptions: Partial<HandlerOptions> = {}) {
  const transport = await oidcTransport();
  const fixture = await authWorkspace();
  const client = await createOidcClient(transport.config, { fetch: transport.fetch });
  const auth = await createServerAuthentication(fixture.ws, transport.config, client);
  const staticRoot = join(fixture.root, 'static');
  const handler = createHandler(fixture.ws, { ...auth, staticRoot, ...handlerOptions });
  const origin = transport.config.publicUrl;
  /** Runs the login redirect and the provider callback; an old session cookie may be sent. */
  async function signIn(oldCookie = '', username = 'bob') {
    const first = await handler(new Request(origin + '/auth/login'));
    const callback = transport.authorize(first.headers.get('location')!, username);
    const attempt = first.headers.getSetCookie()[0].split(';')[0];
    const cookies = [attempt, oldCookie].filter(Boolean).join('; ');
    return handler(new Request(callback, { headers: { Cookie: cookies } }));
  }
  /** Starts authentication again over the same data root with another configuration. */
  async function restart(config: ServerConfig) {
    auth.close();
    const restarted = await createServerAuthentication(fixture.ws, config, client);
    const restartedHandler = createHandler(fixture.ws, { ...restarted, staticRoot });
    return { auth: restarted, handler: restartedHandler };
  }
  return {
    transport,
    fixture,
    client,
    auth,
    handler,
    origin,
    signIn,
    restart,
    [Symbol.dispose]() {
      auth.close();
      fixture.dispose();
    },
  };
}

/** The `sw-session=<id>` pair a sign-in response sets. */
export function sessionCookieOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .find(value => value.startsWith('sw-session='))!
    .split(';')[0];
}
