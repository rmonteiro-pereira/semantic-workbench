// Signs people in to Entra through MSAL on the server: authorization code with PKCE, a token cache
// kept per session inside the encrypted session record, and application tokens for Graph and
// on-behalf-of exchanges. No token ever reaches the browser.
import { randomBytes } from 'node:crypto';
import {
  AuthError,
  ConfidentialClientApplication,
  CryptoProvider,
  InteractionRequiredAuthError,
  LogLevel,
  ResponseMode,
  ServerError,
  type AuthenticationResult,
  type ICachePlugin,
  type INetworkModule,
  type NetworkRequestOptions,
  type NetworkResponse,
  type NodeAuthOptions,
} from '@azure/msal-node';
import { ENTRA_LOGIN_HOSTS, isLoopbackHost, type ClientAuth, type ServerConfig } from '../config';
import { safeReturnTo, type SignInAttempt } from './attempts';
import { createBearerValidator } from './bearer';
import { directoryScope } from './directory';
import { createProviderKeys, sessionClaims, verifyIdToken, type ProviderKeys } from './id-token';
import { managedIdentityAssertion } from './managed-identity';
import { normalizeClaims } from './principal';
import type { SessionTokens } from './sessions';
import { SignInError, tokenSignInError } from './sign-in-error';
import type {
  ProviderFetch,
  SignInDependencies,
  SignInIdentity,
  SignInProvider,
  SignInStart,
} from './sign-in-provider';
import { log } from '../observability/log';

const PROVIDER_TIMEOUT_MS = 5000;

/** The MSAL authority for the configured tenant and the only host MSAL may treat as known. */
export type EntraAuthority = { url: string; host: string };

/**
 * Derives the MSAL authority from the issuer `https://<login host>/<tenant>/v2.0`. Only Microsoft
 * sign-in hosts are accepted, and a loopback host for the mock provider on a developer's machine.
 */
export function entraAuthority(issuer: string, tenantId: string): EntraAuthority {
  const url = new URL(issuer);
  if (!tenantId || url.pathname.toLowerCase() !== `/${tenantId}/v2.0`.toLowerCase()) {
    throw new Error('The Entra issuer must be https://<login host>/<SW_ENTRA_TENANT_ID>/v2.0.');
  }
  const microsoftHost =
    url.protocol === 'https:' && ENTRA_LOGIN_HOSTS.includes(url.hostname) && !url.port;
  if (!microsoftHost && !isLoopbackHost(url.hostname)) {
    throw new Error(`The Entra issuer must use one of ${ENTRA_LOGIN_HOSTS.join(', ')}.`);
  }
  // MSAL accepts only https authorities. It never contacts this URL, because the endpoints it
  // uses come from the discovery document passed to it, so the loopback mock may stay on http.
  return { url: `https://${url.host}/${tenantId}`, host: url.host };
}

/** The discovered endpoints MSAL and the key check use. */
export type EntraMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
};

function sameOrigin(value: unknown, origin: string): value is string {
  return typeof value === 'string' && URL.canParse(value) && new URL(value).origin === origin;
}

/** Accepts a discovery document only for the configured issuer, with endpoints on its host. */
export function entraMetadata(body: unknown, issuer: string): EntraMetadata {
  const document = (body ?? {}) as Record<string, unknown>;
  const origin = new URL(issuer).origin;
  const endpoints = ['authorization_endpoint', 'token_endpoint', 'jwks_uri'] as const;
  if (document.issuer !== issuer) throw new Error('The discovery document names another issuer.');
  for (const name of endpoints) {
    if (!sameOrigin(document[name], origin)) {
      throw new Error(`The discovery document's ${name} is not on the issuer's host.`);
    }
  }
  const signOut = document.end_session_endpoint;
  if (signOut !== undefined && !sameOrigin(signOut, origin)) {
    throw new Error("The discovery document's end_session_endpoint is not on the issuer's host.");
  }
  return {
    issuer,
    authorization_endpoint: document.authorization_endpoint as string,
    token_endpoint: document.token_endpoint as string,
    jwks_uri: document.jwks_uri as string,
    end_session_endpoint: signOut as string | undefined,
  };
}

async function discoverEntra(issuer: string, request: ProviderFetch): Promise<EntraMetadata> {
  const response = await request(issuer + '/.well-known/openid-configuration', {
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('The Entra discovery document is unavailable.');
  return entraMetadata(await response.json(), issuer);
}

/** Maps the configured client credential to MSAL's options; Entra prefers a certificate. */
export function msalCredential(
  auth: ClientAuth,
  assertion: () => Promise<string>,
): Pick<NodeAuthOptions, 'clientSecret' | 'clientCertificate' | 'clientAssertion'> {
  if (auth.kind === 'certificate') {
    const certificate = { privateKey: auth.privateKey };
    if (auth.thumbprint.length === 64) {
      return { clientCertificate: { ...certificate, thumbprintSha256: auth.thumbprint } };
    }
    return { clientCertificate: { ...certificate, thumbprint: auth.thumbprint } };
  }
  if (auth.kind === 'managed-identity') return { clientAssertion: () => assertion() };
  if (auth.kind === 'secret') return { clientSecret: auth.secret };
  throw new Error('Entra needs a certificate, a client secret or a managed identity.');
}

/** Holds one session's serialized MSAL token cache while one operation runs. */
export type SessionTokenCache = { serialized?: string };

/**
 * Lets MSAL read and write one session's cache. The serialized cache goes back into the session
 * record, which the session store encrypts; nothing is written anywhere else.
 */
export function sessionTokenCache(cache: SessionTokenCache): ICachePlugin {
  return {
    async beforeCacheAccess(context) {
      if (cache.serialized) context.tokenCache.deserialize(cache.serialized);
    },
    async afterCacheAccess(context) {
      if (context.cacheHasChanged) cache.serialized = context.tokenCache.serialize();
    },
  };
}

/** Sends MSAL's requests through the provider fetch, with a timeout and no redirects. */
export function providerNetwork(request: ProviderFetch): INetworkModule {
  async function send<Body>(url: string, method: string, options?: NetworkRequestOptions) {
    const response = await request(url, {
      method,
      headers: options?.headers,
      body: options?.body,
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      redirect: 'error',
    });
    const text = await response.text();
    const result: NetworkResponse<Body> = {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: (text ? JSON.parse(text) : {}) as Body,
    };
    return result;
  }
  return {
    sendGetRequestAsync: (url, options) => send(url, 'GET', options),
    sendPostRequestAsync: (url, options) => send(url, 'POST', options),
  };
}

/** Reads the authorization code, refusing an error answer or a callback without a code. */
export function authorizationCode(url: URL): string {
  const code = url.searchParams.get('code');
  if (url.searchParams.has('error') || !code) throw new SignInError('attempt-invalid');
  return code;
}

// MSAL validates state and nonce itself and reports a mismatch with these codes.
const ATTEMPT_ERROR_CODES = new Set(['state_mismatch', 'nonce_mismatch', 'invalid_state']);

/**
 * Maps MSAL failures to the same safe sign-in reasons as the openid-client path. MSAL's error
 * code is the provider code for the log; its message is not used.
 */
export function msalSignInError(error: unknown): SignInError {
  const shared = tokenSignInError(error);
  if (shared) return shared;
  if (!(error instanceof AuthError)) return new SignInError('provider-unreachable', '/', error);
  const code = error.errorCode || undefined;
  const refused =
    error instanceof ServerError ||
    error instanceof InteractionRequiredAuthError ||
    ATTEMPT_ERROR_CODES.has(error.errorCode);
  return new SignInError(refused ? 'attempt-invalid' : 'provider-unreachable', '/', error, code);
}

/** Everything one MSAL operation needs, built once at start-up. */
type MsalContext = {
  config: ServerConfig;
  metadata: EntraMetadata;
  keys: ProviderKeys;
  scopes: string[];
  redirectUri: string;
  now: () => number;
  request: ProviderFetch;
  application(cache?: SessionTokenCache): ConfidentialClientApplication;
};

async function msalIdentity(
  context: MsalContext,
  result: AuthenticationResult,
  cache: SessionTokenCache,
  previous?: SessionTokens,
): Promise<SignInIdentity> {
  if (!result.idToken || !result.expiresOn) throw new SignInError('token-invalid');
  const claims = await verifyIdToken(result.idToken, context.keys, context.config);
  const principal = normalizeClaims(claims, {
    provider: context.config.oidc.provider,
    tenantId: context.config.oidc.tenantId,
    groupClaim: context.config.directory.groupClaim,
  });
  const tokens: SessionTokens = {
    accessToken: result.accessToken,
    idToken: result.idToken,
    expiresAt: result.expiresOn.getTime(),
    tokenCache: cache.serialized,
    ...sessionClaims(claims, context.config.oidc.issuer, previous),
  };
  return { principal, tokens };
}

async function startSignIn(context: MsalContext, returnTo: string): Promise<SignInStart> {
  const pkce = await new CryptoProvider().generatePkceCodes();
  const attempt: SignInAttempt = {
    state: randomBytes(32).toString('base64url'),
    nonce: randomBytes(32).toString('base64url'),
    verifier: pkce.verifier,
    returnTo: safeReturnTo(returnTo),
    issuedAt: context.now(),
  };
  const url = await context.application().getAuthCodeUrl({
    scopes: context.scopes,
    redirectUri: context.redirectUri,
    codeChallenge: pkce.challenge,
    codeChallengeMethod: 'S256',
    state: attempt.state,
    nonce: attempt.nonce,
    responseMode: ResponseMode.QUERY,
  });
  return { url, attempt };
}

async function completeSignIn(context: MsalContext, url: URL, attempt: SignInAttempt) {
  const code = authorizationCode(url);
  const cache: SessionTokenCache = {};
  const request = {
    code,
    scopes: context.scopes,
    redirectUri: context.redirectUri,
    codeVerifier: attempt.verifier,
    state: attempt.state,
    nonce: attempt.nonce,
  };
  const payload = { code, state: url.searchParams.get('state') ?? '' };
  const result = await context.application(cache).acquireTokenByCode(request, payload);
  return msalIdentity(context, result, cache);
}

async function renewSignIn(context: MsalContext, tokens: SessionTokens) {
  // A session from before Entra moved to MSAL has no MSAL cache; it ends once, at its refresh.
  if (!tokens.tokenCache) throw new SignInError('session-upgraded');
  const cache: SessionTokenCache = { serialized: tokens.tokenCache };
  const application = context.application(cache);
  const accounts = await application.getTokenCache().getAllAccounts();
  if (accounts.length !== 1) throw new SignInError('token-invalid');
  const result = await application.acquireTokenSilent({
    account: accounts[0],
    scopes: context.scopes,
    forceRefresh: true,
  });
  // Refresh must return current identity claims; the old ID token would keep the old groups.
  if (result.idToken === tokens.idToken) throw new SignInError('token-invalid');
  return msalIdentity(context, result, cache, tokens);
}

function signOutUrl(context: MsalContext, tokens?: SessionTokens): string {
  const endpoint = context.metadata.end_session_endpoint;
  if (!endpoint) return '/auth/signed-out';
  const url = new URL(endpoint);
  url.searchParams.set('client_id', context.config.oidc.clientId);
  url.searchParams.set('post_logout_redirect_uri', context.config.publicUrl + '/auth/signed-out');
  if (tokens?.loginHint) url.searchParams.set('logout_hint', tokens.loginHint);
  return url.href;
}

async function applicationToken(acquire: () => Promise<AuthenticationResult | null>) {
  const result = await acquire();
  if (!result?.accessToken) throw new Error('Entra returned no application token.');
  return result;
}

async function delegatedToken(context: MsalContext, userToken: string, scopes: string[]) {
  const request = { oboAssertion: userToken, scopes };
  const result = await applicationToken(() =>
    context.application().acquireTokenOnBehalfOf(request),
  );
  if (!result.expiresOn) throw new Error('The on-behalf-of token has no lifetime.');
  return { token: result.accessToken, expiresAt: result.expiresOn.getTime() };
}

function msalLogger(level: LogLevel, message: string, containsPii: boolean) {
  // Personal data is never logged; MSAL marks such messages and they are dropped.
  if (containsPii || level !== LogLevel.Error) return;
  log.error('auth.msal-error', { detail: message });
}

/** Discovers the Entra tenant and returns MSAL's sign-in operations. */
export async function createMsalProvider(
  config: ServerConfig,
  dependencies: SignInDependencies = {},
): Promise<SignInProvider> {
  const request = dependencies.fetch ?? fetch;
  const authority = entraAuthority(config.oidc.issuer, config.oidc.tenantId ?? '');
  const metadata = await discoverEntra(config.oidc.issuer, request);
  const credential = msalCredential(
    config.oidc.clientAuth,
    dependencies.assertion ?? managedIdentityAssertion,
  );
  const now = dependencies.now ?? Date.now;
  const application = (cache?: SessionTokenCache) =>
    new ConfidentialClientApplication({
      auth: {
        clientId: config.oidc.clientId,
        authority: authority.url,
        knownAuthorities: [authority.host],
        authorityMetadata: JSON.stringify(metadata),
        ...credential,
      },
      system: {
        networkClient: providerNetwork(request),
        loggerOptions: {
          piiLoggingEnabled: false,
          logLevel: LogLevel.Error,
          loggerCallback: msalLogger,
        },
      },
      cache: cache ? { cachePlugin: sessionTokenCache(cache) } : {},
    });
  const context: MsalContext = {
    config,
    metadata,
    keys: createProviderKeys(metadata.jwks_uri, request, now),
    scopes: config.oidc.scopes.split(/\s+/).filter(Boolean),
    redirectUri: config.publicUrl + '/auth/callback',
    now,
    request,
    application,
  };
  return msalOperations(context, application());
}

// The Graph application token is cached in this one client's memory and reused until it expires.
function msalOperations(
  context: MsalContext,
  applicationClient: ConfidentialClientApplication,
): SignInProvider {
  const { config, metadata, keys } = context;
  return {
    bearer: createBearerValidator(config, metadata.jwks_uri, context.request),
    get jwksRefreshedAt() {
      return keys.refreshedAt();
    },
    login: returnTo => startSignIn(context, returnTo),
    async callback(url, attempt) {
      try {
        return await completeSignIn(context, url, attempt);
      } catch (error) {
        throw msalSignInError(error);
      }
    },
    async refresh(tokens) {
      try {
        return await renewSignIn(context, tokens);
      } catch (error) {
        throw msalSignInError(error);
      }
    },
    logout: tokens => signOutUrl(context, tokens),
    directoryToken: () =>
      applicationToken(() =>
        applicationClient.acquireTokenByClientCredential({
          scopes: [directoryScope(config.directory.graphUrl)],
        }),
      ).then(result => result.accessToken),
    // A fresh client per exchange keeps no person's delegated token in memory; the caller
    // stores the result in that person's encrypted session.
    onBehalfOf: (userToken, scopes) => delegatedToken(context, userToken, scopes),
  };
}
