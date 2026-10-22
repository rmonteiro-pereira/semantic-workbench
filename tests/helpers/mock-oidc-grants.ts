// Implements token grants with client authentication and rotating user authorizations.
import { TEST_CLIENTS, TEST_TENANT_ID, TEST_WORKBENCH_CLIENT } from './auth-identities';
import {
  readAccessToken,
  sha256,
  signToken,
  stableUuid,
  userClaims,
  type Authorization,
  type ProviderState,
} from './mock-oidc-state';

/** Formats a protocol error without exposing request credentials. */
export function oauthError(error: string, description: string, status = 400): Response {
  return Response.json({ error, error_description: description }, { status });
}

function authenticateClient(request: Request, params: URLSearchParams) {
  let clientId = params.get('client_id');
  let secret = params.get('client_secret');
  const authorization = request.headers.get('authorization');
  if (authorization) {
    if (!authorization.startsWith('Basic ')) return undefined;
    try {
      const decoded = atob(authorization.slice(6));
      const separator = decoded.indexOf(':');
      if (separator < 0) return undefined;
      clientId = decodeURIComponent(decoded.slice(0, separator).replaceAll('+', ' '));
      secret = decodeURIComponent(decoded.slice(separator + 1).replaceAll('+', ' '));
    } catch {
      return undefined;
    }
  }
  const clients = [TEST_WORKBENCH_CLIENT, ...Object.values(TEST_CLIENTS)];
  return clients.find(client => client.clientId === clientId && client.secret === secret);
}

async function userTokens(state: ProviderState, authorization: Authorization, nonce?: string) {
  const { username, clientId, scope } = authorization;
  const claims = userClaims(state, username, clientId);
  const idClaims = { ...claims };
  if (nonce !== undefined) idClaims.nonce = nonce;
  const idToken = await signToken(state, idClaims, clientId, state.lifetimes.idToken);
  const accessToken = await signToken(
    state,
    { ...claims, scp: scope },
    state.apiAudience,
    state.lifetimes.accessToken,
  );
  state.accessTokens.set(accessToken, { username, clientId });
  const refreshToken = crypto.randomUUID();
  state.refreshTokens.set(refreshToken, {
    username,
    clientId,
    scope,
    expiresAt: Date.now() + state.lifetimes.refreshToken * 1000,
  });
  return Response.json({
    token_type: 'Bearer',
    id_token: idToken,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: state.lifetimes.accessToken,
    scope,
  });
}

function authorizationCodeGrant(state: ProviderState, params: URLSearchParams, clientId: string) {
  const code = params.get('code') ?? '';
  const authorization = state.codes.get(code);
  if (!authorization) return oauthError('invalid_grant', 'Unknown authorization code');
  // Consume before signing so simultaneous redemptions cannot both succeed.
  state.codes.delete(code);
  const verifier = params.get('code_verifier');
  if (
    authorization.expiresAt <= Date.now() ||
    authorization.clientId !== clientId ||
    authorization.redirectUri !== params.get('redirect_uri') ||
    !verifier ||
    sha256(verifier) !== authorization.challenge
  ) {
    return oauthError('invalid_grant', 'Expired code or mismatched authorization binding');
  }
  return userTokens(state, authorization, authorization.nonce);
}

function refreshTokenGrant(state: ProviderState, params: URLSearchParams, clientId: string) {
  const token = params.get('refresh_token') ?? '';
  const authorization = state.refreshTokens.get(token);
  if (
    !authorization ||
    authorization.clientId !== clientId ||
    authorization.expiresAt <= Date.now()
  ) {
    return oauthError('invalid_grant', 'Invalid or expired refresh token');
  }
  state.refreshTokens.delete(token);
  return userTokens(state, authorization);
}

function scopeAudience(scope: string): string | undefined {
  const scopes = scope.trim().split(/\s+/);
  const separator = scopes[0].lastIndexOf('/');
  if (separator <= 0) return undefined;
  const audience = scopes[0].slice(0, separator);
  if (!scopes.every(entry => entry.startsWith(`${audience}/`))) return undefined;
  return audience;
}

async function clientCredentialsGrant(
  state: ProviderState,
  params: URLSearchParams,
  clientId: string,
) {
  const scope = params.get('scope') ?? '';
  if (!scope.endsWith('/.default') || /\s/.test(scope)) {
    return oauthError('invalid_scope', 'Client credentials require one /.default scope');
  }
  const audience = scope.slice(0, -'/.default'.length);
  if (!audience) return oauthError('invalid_scope', 'A scope audience is required');
  const oid = stableUuid(clientId);
  const claims = {
    sub: oid,
    oid,
    tid: TEST_TENANT_ID,
    azp: clientId,
    appid: clientId,
    idtyp: 'app',
  };
  const token = await signToken(state, claims, audience, state.lifetimes.accessToken);
  state.accessTokens.set(token, { clientId });
  return Response.json({
    token_type: 'Bearer',
    access_token: token,
    expires_in: state.lifetimes.accessToken,
    scope,
  });
}

async function onBehalfOfGrant(state: ProviderState, params: URLSearchParams, clientId: string) {
  if (
    clientId !== TEST_WORKBENCH_CLIENT.clientId ||
    params.get('requested_token_use') !== 'on_behalf_of'
  ) {
    return oauthError('invalid_grant', 'Expected the workbench on-behalf-of request');
  }
  const identity = await readAccessToken(state, params.get('assertion') ?? '', state.apiAudience);
  if (!identity?.username) return oauthError('invalid_grant', 'Expected a user API access token');
  const scope = params.get('scope') ?? '';
  const audience = scopeAudience(scope);
  if (!audience) return oauthError('invalid_scope', 'Expected scopes for one audience');
  const claims = userClaims(state, identity.username, clientId);
  const accessToken = await signToken(
    state,
    { ...claims, scp: scope },
    audience,
    state.lifetimes.accessToken,
  );
  state.accessTokens.set(accessToken, { username: identity.username, clientId });
  return Response.json({
    token_type: 'Bearer',
    access_token: accessToken,
    expires_in: state.lifetimes.accessToken,
    scope,
  });
}

/** Authenticates a client and dispatches its requested token grant. */
export function tokenEndpoint(state: ProviderState, request: Request, params: URLSearchParams) {
  const client = authenticateClient(request, params);
  if (!client) return oauthError('invalid_client', 'Invalid client credentials', 401);
  switch (params.get('grant_type')) {
    case 'authorization_code':
      return authorizationCodeGrant(state, params, client.clientId);
    case 'refresh_token':
      return refreshTokenGrant(state, params, client.clientId);
    case 'client_credentials':
      return clientCredentialsGrant(state, params, client.clientId);
    case 'urn:ietf:params:oauth:grant-type:jwt-bearer':
      return onBehalfOfGrant(state, params, client.clientId);
    default:
      return oauthError('unsupported_grant_type', 'Unknown grant type');
  }
}
