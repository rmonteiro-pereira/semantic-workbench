// Keeps OpenID protocol validation and provider credentials outside HTTP routing.
import { createBearerValidator } from './bearer';
import * as oidc from 'openid-client';
import { importPKCS8, createRemoteJWKSet, jwtVerify, customFetch, errors } from 'jose';
import { readFile } from 'node:fs/promises';
import { isLoopbackHost, type ServerConfig } from '../config';
import { normalizeClaims, ClaimError } from './principal';
import type { SessionTokens } from './sessions';
import { SignInError } from './sign-in-error';

/** Safe provider diagnostics; credentials are never part of this object. */
export type ProviderStatus = {
  issuer: string | null;
  clientId: string | null;
  discovery: string;
  groupClaimMode: string;
  overage: 'directory' | 'off';
  jwksRefreshedAt: string | null;
};

/** Maps typed protocol failures to safe, stable sign-in reasons. */
export function signInError(error: unknown): SignInError {
  if (error instanceof SignInError) return error;
  if (error instanceof ClaimError) {
    return new SignInError(
      error.reason === 'tenant-mismatch' ? 'tenant-mismatch' : 'token-invalid',
      '/',
      error,
    );
  }
  if (error instanceof oidc.AuthorizationResponseError || error instanceof oidc.ResponseBodyError) {
    return new SignInError('attempt-invalid', '/', error);
  }
  if (error instanceof errors.JOSEError) return new SignInError('token-invalid', '/', error);
  if (error instanceof oidc.ClientError) {
    const detail = error.cause instanceof Error ? error.cause.cause : undefined;
    if (detail && typeof detail === 'object') {
      if ('claim' in detail && detail.claim === 'nonce')
        return new SignInError('attempt-invalid', '/', error);
      if ('parameters' in detail && detail.parameters instanceof URLSearchParams) {
        return new SignInError('attempt-invalid', '/', error);
      }
    }
    if (
      [
        'OAUTH_JWT_CLAIM_COMPARISON_FAILED',
        'OAUTH_JWT_TIMESTAMP_CHECK_FAILED',
        'OAUTH_INVALID_RESPONSE',
        'OAUTH_KEY_SELECTION_FAILED',
      ].includes(error.code ?? '')
    ) {
      return new SignInError('token-invalid', '/', error);
    }
  }
  return new SignInError('provider-unreachable', '/', error);
}

/** Browser-bound values needed to complete one authorization code exchange. */
export type SignInAttempt = {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  issuedAt: number;
};

/** Restricts post-login navigation to paths within the workbench origin. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/';
  const parsed = new URL(value, 'https://workbench.invalid');
  return parsed.origin === 'https://workbench.invalid' && !parsed.pathname.startsWith('//')
    ? parsed.pathname + parsed.search + parsed.hash
    : '/';
}

/** Gets a federated assertion from the platform, without exposing its response to callers. */
export async function managedIdentityAssertion(
  env: Record<string, string | undefined> = process.env,
  request: typeof fetch = fetch,
): Promise<string> {
  if (!env.IDENTITY_ENDPOINT || !env.IDENTITY_HEADER) {
    throw new Error('Managed identity endpoint configuration is missing.');
  }
  const url = new URL(env.IDENTITY_ENDPOINT);
  url.searchParams.set('resource', 'api://AzureADTokenExchange');
  url.searchParams.set('api-version', '2019-08-01');
  const response = await request(url, {
    headers: { 'X-IDENTITY-HEADER': env.IDENTITY_HEADER },
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Managed identity assertion unavailable.');
  const body = (await response.json()) as { access_token?: unknown };
  if (typeof body.access_token !== 'string') throw new Error('Invalid managed identity assertion.');
  return body.access_token;
}

async function authentication(
  config: ServerConfig,
  assertion: () => Promise<string>,
): Promise<oidc.ClientAuth> {
  const credential = config.oidc.clientAuth;
  if (credential.kind === 'secret') return oidc.ClientSecretPost(credential.secret);
  if (credential.kind === 'private-key') {
    const key = await importPKCS8(await readFile(credential.keyPath, 'utf8'), 'RS256');
    return oidc.PrivateKeyJwt(key);
  }
  return async (_server, client, body) => {
    body.set('client_id', client.client_id);
    body.set('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
    body.set('client_assertion', await assertion());
  };
}

/** Discovers the issuer and constructs a confidential client with explicit signature checks. */
export async function createOidcClient(
  config: ServerConfig,
  dependencies: {
    assertion?: () => Promise<string>;
    now?: () => number;
    fetch?: oidc.CustomFetch;
  } = {},
) {
  const now = dependencies.now ?? Date.now;
  const issuer = new URL(config.oidc.issuer);
  const publicUrl = new URL(config.publicUrl);
  const insecure = issuer.protocol === 'http:';
  if (insecure && !(isLoopbackHost(issuer.hostname) && isLoopbackHost(publicUrl.hostname))) {
    throw new Error('An HTTP issuer requires a loopback public URL.');
  }
  const auth = await authentication(config, dependencies.assertion ?? managedIdentityAssertion);
  const execute: ((client: oidc.Configuration) => void)[] = [];
  if (insecure) execute.push(oidc.allowInsecureRequests);
  const client = await oidc.discovery(
    issuer,
    config.oidc.clientId,
    {
      [oidc.clockTolerance]: 300,
    },
    auth,
    { execute, timeout: 5, [oidc.customFetch]: dependencies.fetch },
  );
  const jwksUri = client.serverMetadata().jwks_uri;
  if (!jwksUri) throw new Error('The provider has no signing key endpoint.');
  let jwksRefreshedAt: string | null = null;
  // Reload an unknown key immediately so provider rotation does not end active sessions.
  const keys = createRemoteJWKSet(new URL(jwksUri), {
    cooldownDuration: 0,
    timeoutDuration: 5000,
    [customFetch]: async (url, init) => {
      const response = await (dependencies.fetch ?? fetch)(url, {
        ...init,
        body: undefined,
        headers: Object.fromEntries(init.headers),
      });
      if (response.ok) jwksRefreshedAt = new Date(now()).toISOString();
      return response;
    },
  });
  const mapping = {
    provider: config.oidc.provider,
    tenantId: config.oidc.tenantId,
    groupClaim: config.directory.groupClaim,
  };
  const redirectUri = config.publicUrl + '/auth/callback';

  async function identity(
    response: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>,
    previous?: SessionTokens,
  ) {
    let claims: Record<string, unknown> | undefined;
    if (response.id_token) {
      claims = (
        await jwtVerify(response.id_token, keys, {
          issuer: config.oidc.issuer,
          audience: config.oidc.clientId,
          algorithms: ['RS256', 'ES256'],
          clockTolerance: 300,
        })
      ).payload;
    }
    if (!claims && previous?.idToken) {
      // Refresh must return current identity claims; retaining the old groups would preserve access.
      const subject = JSON.parse(
        Buffer.from(previous.idToken.split('.')[1], 'base64url').toString(),
      ).sub;
      claims = await oidc.fetchUserInfo(client, response.access_token, subject);
      claims = { ...claims, iss: config.oidc.issuer };
    }
    if (!claims) throw new SignInError('token-invalid');
    const principal = normalizeClaims(claims, mapping);
    const lifetime = response.expires_in;
    if (typeof lifetime !== 'number' || !Number.isFinite(lifetime) || lifetime <= 0) {
      throw new SignInError('token-invalid');
    }
    return {
      principal,
      tokens: {
        accessToken: response.access_token,
        idToken: response.id_token ?? previous?.idToken,
        refreshToken: response.refresh_token ?? previous?.refreshToken,
        expiresAt: now() + lifetime * 1000,
      },
    };
  }
  return {
    bearer: createBearerValidator(config, jwksUri, dependencies.fetch as typeof fetch | undefined),
    get jwksRefreshedAt() {
      return jwksRefreshedAt;
    },
    async login(returnTo: string) {
      const attempt: SignInAttempt = {
        state: oidc.randomState(),
        nonce: oidc.randomNonce(),
        verifier: oidc.randomPKCECodeVerifier(),
        returnTo: safeReturnTo(returnTo),
        issuedAt: now(),
      };
      const url = oidc.buildAuthorizationUrl(client, {
        redirect_uri: redirectUri,
        scope: config.oidc.scopes,
        code_challenge: await oidc.calculatePKCECodeChallenge(attempt.verifier),
        code_challenge_method: 'S256',
        state: attempt.state,
        nonce: attempt.nonce,
      });
      return { url: url.href, attempt };
    },
    async callback(url: URL, attempt: SignInAttempt) {
      try {
        const response = await oidc.authorizationCodeGrant(client, url, {
          pkceCodeVerifier: attempt.verifier,
          expectedState: attempt.state,
          expectedNonce: attempt.nonce,
          idTokenExpected: true,
        });
        return await identity(response);
      } catch (error) {
        throw signInError(error);
      }
    },
    async refresh(tokens: SessionTokens) {
      try {
        if (!tokens.refreshToken) throw new SignInError('token-invalid');
        return await identity(await oidc.refreshTokenGrant(client, tokens.refreshToken), tokens);
      } catch (error) {
        throw signInError(error);
      }
    },
    logout() {
      if (!client.serverMetadata().end_session_endpoint) return '/auth/signed-out';
      return oidc.buildEndSessionUrl(client, {
        client_id: config.oidc.clientId,
        post_logout_redirect_uri: config.publicUrl + '/auth/signed-out',
      }).href;
    },
    async directoryToken() {
      const scope = isLoopbackHost(new URL(config.directory.graphUrl).hostname)
        ? 'https://graph.microsoft.com/.default'
        : config.directory.graphUrl + '/.default';
      const token = await oidc.clientCredentialsGrant(client, { scope });
      return token.access_token;
    },
  };
}
/** Discovered provider operations used by the server authentication boundary. */
export type OidcClient = Awaited<ReturnType<typeof createOidcClient>>;
