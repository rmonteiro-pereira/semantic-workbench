// Keeps OpenID protocol validation and provider credentials outside HTTP routing.
import { createBearerValidator } from './bearer';
import * as oidc from 'openid-client';
import { importPKCS8 } from 'jose';
import { readFile } from 'node:fs/promises';
import { isLoopbackHost, type ServerConfig } from '../config';
import { normalizeClaims } from './principal';
import type { SessionTokens } from './sessions';
import { SignInError, tokenSignInError } from './sign-in-error';
import { createProviderKeys, sessionClaims, verifyIdToken } from './id-token';
import { directoryScope } from './directory';
import { safeReturnTo, type SignInAttempt } from './attempts';
import { managedIdentityAssertion } from './managed-identity';
import type { ProviderFetch, SignInDependencies, SignInProvider } from './sign-in-provider';

/** Safe provider diagnostics; credentials are never part of this object. */
export type ProviderStatus = {
  issuer: string | null;
  clientId: string | null;
  discovery: string;
  groupClaimMode: string;
  overage: 'directory' | 'off';
  jwksRefreshedAt: string | null;
};

/** The OAuth error code and description a provider returned, the only text safe to log. */
function providerCode(error: { error: string; error_description?: string }): string {
  return error.error_description ? `${error.error}: ${error.error_description}` : error.error;
}

/** Maps typed protocol failures to safe, stable sign-in reasons. */
export function signInError(error: unknown): SignInError {
  const shared = tokenSignInError(error);
  if (shared) return shared;
  if (error instanceof oidc.AuthorizationResponseError || error instanceof oidc.ResponseBodyError) {
    return new SignInError('attempt-invalid', '/', error, providerCode(error));
  }
  if (error instanceof oidc.ClientError) {
    const detail = error.cause instanceof Error ? error.cause.cause : undefined;
    if (detail && typeof detail === 'object') {
      if ('claim' in detail && detail.claim === 'nonce') return new SignInError('attempt-invalid', '/', error);
      if ('parameters' in detail && detail.parameters instanceof URLSearchParams) {
        return new SignInError('attempt-invalid', '/', error);
      }
    }
    if (['OAUTH_JWT_CLAIM_COMPARISON_FAILED', 'OAUTH_JWT_TIMESTAMP_CHECK_FAILED', 'OAUTH_INVALID_RESPONSE', 'OAUTH_KEY_SELECTION_FAILED'].includes(error.code ?? '')) {
      return new SignInError('token-invalid', '/', error);
    }
  }
  return new SignInError('provider-unreachable', '/', error);
}

async function authentication(config: ServerConfig, assertion: () => Promise<string>): Promise<oidc.ClientAuth> {
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

/** Adapts the provider fetch to openid-client, whose declared body type is wider than fetch's. */
function openidFetch(request: ProviderFetch): oidc.CustomFetch {
  return (url, options) => {
    const { body, ...rest } = options;
    const copied = body instanceof Uint8Array ? new Uint8Array(body) : body;
    return request(url, { ...rest, body: copied ?? undefined });
  };
}

/** Discovers the issuer and constructs a confidential client with explicit signature checks. */
export async function createOidcClient(config: ServerConfig, dependencies: SignInDependencies = {}): Promise<SignInProvider> {
  const now = dependencies.now ?? Date.now;
  const request = dependencies.fetch;
  const customFetch = request && openidFetch(request);
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
    { execute, timeout: 5, [oidc.customFetch]: customFetch },
  );
  const jwksUri = client.serverMetadata().jwks_uri;
  if (!jwksUri) throw new Error('The provider has no signing key endpoint.');
  const keys = createProviderKeys(jwksUri, request, now);
  const mapping = {
    provider: config.oidc.provider,
    tenantId: config.oidc.tenantId,
    groupClaim: config.directory.groupClaim,
  };
  const redirectUri = config.publicUrl + '/auth/callback';

  async function identity(response: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>, previous?: SessionTokens) {
    let claims: Record<string, unknown> | undefined;
    if (response.id_token) {
      claims = await verifyIdToken(response.id_token, keys, config);
    }
    if (!claims && previous?.idToken) {
      // Refresh must return current identity claims; retaining the old groups would preserve access.
      const subject = JSON.parse(Buffer.from(previous.idToken.split('.')[1], 'base64url').toString()).sub;
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
        ...sessionClaims(claims, config.oidc.issuer, previous),
      },
    };
  }
  return {
    bearer: createBearerValidator(config, jwksUri, request),
    get jwksRefreshedAt() {
      return keys.refreshedAt();
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
    logout(tokens?: SessionTokens) {
      if (!client.serverMetadata().end_session_endpoint) return '/auth/signed-out';
      const parameters: Record<string, string> = {
        client_id: config.oidc.clientId,
        post_logout_redirect_uri: config.publicUrl + '/auth/signed-out',
      };
      if (tokens?.loginHint) parameters.logout_hint = tokens.loginHint;
      return oidc.buildEndSessionUrl(client, parameters).href;
    },
    /** Exchanges the person's workbench API token for one another API accepts on their behalf. */
    async onBehalfOf(userToken: string, scopes: string[]) {
      const response = await oidc.genericGrantRequest(client, 'urn:ietf:params:oauth:grant-type:jwt-bearer', { assertion: userToken, scope: scopes.join(' '), requested_token_use: 'on_behalf_of' });
      const lifetime = response.expires_in;
      if (typeof lifetime !== 'number' || !Number.isFinite(lifetime) || lifetime <= 0) {
        throw new Error('The on-behalf-of token has no lifetime.');
      }
      return { token: response.access_token, expiresAt: now() + lifetime * 1000 };
    },
    async directoryToken() {
      const scope = directoryScope(config.directory.graphUrl);
      const token = await oidc.clientCredentialsGrant(client, { scope });
      return token.access_token;
    },
  };
}
