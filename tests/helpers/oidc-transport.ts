// Adapts the mock provider's token implementation to an in-memory HTTP edge for socketless tests.
import { SignJWT, decodeJwt } from 'jose';
import { createProviderState, type ClaimShape } from './mock-oidc-state';
import { tokenEndpoint } from './mock-oidc-grants';
import { oidcConfig } from './server-auth';

/** Supplies mock protocol responses without listening or making network calls. */
export async function oidcTransport(shape: ClaimShape = 'entra') {
  const state = await createProviderState({ shape });
  state.issuer = 'http://127.0.0.1:4444/issuer';
  state.graphUrl = 'http://127.0.0.1:4444/graph';
  let change: Record<string, unknown> = {};
  let wrongSignature = false;
  const config = oidcConfig(state.issuer, state.graphUrl, shape);
  async function request(input: string, init: RequestInit): Promise<Response> {
    const url = new URL(input);
    if (url.pathname.endsWith('/.well-known/openid-configuration')) {
      return Response.json({
        issuer: state.issuer,
        authorization_endpoint: state.issuer + '/authorize',
        token_endpoint: state.issuer + '/token',
        jwks_uri: state.issuer + '/keys',
        end_session_endpoint: state.issuer + '/logout',
        response_types_supported: ['code'],
        subject_types_supported: ['pairwise'],
        id_token_signing_alg_values_supported: ['RS256'],
      });
    }
    if (url.pathname.endsWith('/keys')) {
      return Response.json({ keys: state.keys.slice(0, state.activeKey + 1).map(key => key.jwk) });
    }
    if (!url.pathname.endsWith('/token')) throw new Error('Unexpected mock URL: ' + url.pathname);
    const req = new Request(url, { ...init, body: init.body as BodyInit | undefined });
    const response = await tokenEndpoint(state, req, new URLSearchParams(await req.text()));
    if (!response.ok) return response;
    const body = await response.json();
    if (body.id_token && (Object.keys(change).length || wrongSignature)) {
      const claims = { ...decodeJwt(body.id_token), ...change };
      const key = state.keys[wrongSignature ? 1 : state.activeKey];
      body.id_token = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: state.keys[state.activeKey].kid }).sign(key.privateKey);
    }
    return Response.json(body);
  }
  return {
    config,
    state,
    fetch: request,
    changeClaims: (claims: Record<string, unknown>) => {
      change = claims;
    },
    breakSignature: () => {
      wrongSignature = true;
    },
    authorize(url: string, username = 'alice'): URL {
      const parameters = new URL(url).searchParams;
      const code = crypto.randomUUID();
      state.codes.set(code, {
        username,
        clientId: config.oidc.clientId,
        scope: parameters.get('scope')!,
        redirectUri: parameters.get('redirect_uri')!,
        challenge: parameters.get('code_challenge')!,
        nonce: parameters.get('nonce')!,
        expiresAt: Date.now() + 60000,
      });
      const callback = new URL(parameters.get('redirect_uri')!);
      callback.searchParams.set('code', code);
      callback.searchParams.set('state', parameters.get('state')!);
      return callback;
    },
  };
}
