// The four answers anyone can ask for: the two discovery documents and the token endpoint, plus the pages of the browser flow, which `oauth-consent.ts` serves. This file only reads the request and answers; every decision about a grant belongs to the connection service.
import { createAnonymousAuditGate } from '../auth/rate-limit';
import { requestSourceIp, type AuditRequest } from '../request';
import type { ConnectionService, IssuedTokens, TokenOutcome } from '../connections/connection-service';
import { readForm, type FormFields } from '../connections/form-body';
import {
  AUTHORIZATION_SERVER_METADATA_PATH,
  METADATA_MAX_AGE_SECONDS,
  PROTECTED_RESOURCE_METADATA_PATH,
  PROTECTED_RESOURCE_ROOT_PATH,
  SETUP_GRANT_TYPE,
  TOKEN_PATH,
  authorizationServerMetadata,
  protectedResourceMetadata,
} from '../connections/server-metadata';
import { recordConnectionEvent, type ConnectionGrantType } from '../observability/metrics';
import type { Route } from './http';

export type OAuthRouteDependencies = { publicUrl: string; service: ConnectionService; now?: () => number };

/** No cookie, no cache: the answers carry or point at credentials. */
const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };

function metadataResponse(document: object): Response {
  return Response.json(document, { headers: { 'Cache-Control': `public, max-age=${METADATA_MAX_AGE_SECONDS}` } });
}

/** One answer for every failure that concerns a credential, whatever it was, so the body, status and headers reveal nothing about the program or the grant. */
function invalidGrant(): Response {
  return Response.json({ error: 'invalid_grant' }, { status: 400, headers: NO_STORE });
}

function invalidRequest(): Response {
  return Response.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE });
}

function tokenResponse(tokens: IssuedTokens): Response {
  return Response.json({ access_token: tokens.accessToken, token_type: 'Bearer', expires_in: tokens.expiresInSeconds, refresh_token: tokens.refreshToken, scope: tokens.scope }, { headers: NO_STORE });
}

type TokenRequest = { grant: ConnectionGrantType; trade: () => Promise<TokenOutcome> };

/** The required fields of each grant. A missing or repeated field is a malformed request, not a bad credential. */
function tokenRequestOf(fields: FormFields, service: ConnectionService): TokenRequest | null {
  const field = (name: string) => fields.single.get(name);
  const type = field('grant_type');
  const clientId = field('client_id');
  const resource = field('resource');
  if (!clientId || !resource) return null;
  if (type === 'authorization_code') {
    const [code, redirectUri, codeVerifier] = [field('code'), field('redirect_uri'), field('code_verifier')];
    if (!code || !redirectUri || !codeVerifier) return null;
    return { grant: 'authorization_code', trade: () => service.issueFromCode({ code, clientId, redirectUri, codeVerifier, resource }) };
  }
  if (type === 'refresh_token') {
    const refreshToken = field('refresh_token');
    if (!refreshToken) return null;
    return { grant: 'refresh_token', trade: () => service.refresh({ refreshToken, clientId, resource }) };
  }
  if (type === SETUP_GRANT_TYPE) {
    const setupCredential = field('setup_credential');
    if (!setupCredential) return null;
    return { grant: 'setup', trade: () => service.issueFromSetup({ setupCredential, clientId, resource }) };
  }
  return null;
}

/** Creates the public routes. The anonymous refusals are written to the audit log at most once a minute per source address once a burst has passed. */
export function createOAuthRoutes(dependencies: OAuthRouteDependencies): Route {
  const { service, publicUrl } = dependencies;
  const auditGate = createAnonymousAuditGate(dependencies.now);

  function auditRefusal(request: Request, reason: string) {
    const admission = auditGate((request as AuditRequest)[requestSourceIp], `token-${reason}`);
    if (!admission.record) return;
    service.events.record({ action: 'connection.refused', origin: 'mcp', outcome: 'refused', reason, suppressed: admission.suppressed });
  }

  async function token(request: Request): Promise<Response> {
    const read = await readForm(request);
    const parsed = read.ok ? tokenRequestOf(read.fields, service) : null;
    if (!parsed) {
      recordConnectionEvent('token', 'none', 'refused');
      auditRefusal(request, 'malformed');
      return invalidRequest();
    }
    const outcome = await parsed.trade();
    if (!outcome.ok) {
      recordConnectionEvent('token', parsed.grant, 'refused');
      auditRefusal(request, outcome.reason);
      return invalidGrant();
    }
    recordConnectionEvent('token', parsed.grant, 'ok');
    return tokenResponse(outcome.tokens);
  }

  return async (_workspace, request, url) => {
    if (request.method === 'GET' && (url.pathname === PROTECTED_RESOURCE_METADATA_PATH || url.pathname === PROTECTED_RESOURCE_ROOT_PATH)) {
      recordConnectionEvent('metadata', 'none', 'ok');
      return metadataResponse(protectedResourceMetadata(publicUrl));
    }
    if (request.method === 'GET' && url.pathname === AUTHORIZATION_SERVER_METADATA_PATH) {
      recordConnectionEvent('metadata', 'none', 'ok');
      return metadataResponse(authorizationServerMetadata(publicUrl));
    }
    if (request.method === 'POST' && url.pathname === TOKEN_PATH) return token(request);
    return null;
  };
}
