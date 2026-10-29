// Checks ID token signatures against the provider's published keys, whichever library signed in.
import { createRemoteJWKSet, customFetch, jwtVerify, type JWTPayload } from 'jose';
import type { ServerConfig } from '../config';
import type { SessionTokens } from './sessions';
import type { ProviderFetch } from './sign-in-provider';

const KEY_FETCH_TIMEOUT_MS = 5000;
const CLOCK_SKEW_SECONDS = 300;

/** The provider's signing keys and when they were last downloaded, for provider diagnostics. */
export type ProviderKeys = {
  keys: ReturnType<typeof createRemoteJWKSet>;
  refreshedAt(): string | null;
};

/** Loads the signing keys of a sign-in provider from its discovered key endpoint. */
export function createProviderKeys(jwksUri: string, request: ProviderFetch | undefined, now: () => number): ProviderKeys {
  let refreshedAt: string | null = null;
  // Reload an unknown key immediately so provider rotation does not end active sessions.
  const keys = createRemoteJWKSet(new URL(jwksUri), {
    cooldownDuration: 0,
    timeoutDuration: KEY_FETCH_TIMEOUT_MS,
    [customFetch]: async (url, init) => {
      const response = await (request ?? fetch)(url, {
        ...init,
        body: undefined,
        headers: Object.fromEntries(init.headers),
      });
      if (response.ok) refreshedAt = new Date(now()).toISOString();
      return response;
    },
  });
  return { keys, refreshedAt: () => refreshedAt };
}

/** Verifies an ID token's signature, issuer, audience and lifetime and returns its claims. */
export async function verifyIdToken(idToken: string, keys: ProviderKeys, config: ServerConfig): Promise<JWTPayload> {
  const verified = await jwtVerify(idToken, keys.keys, {
    issuer: config.oidc.issuer,
    audience: config.oidc.clientId,
    algorithms: ['RS256', 'ES256'],
    clockTolerance: CLOCK_SKEW_SECONDS,
  });
  return verified.payload;
}

/**
 * The verified claims a session keeps for sign-out: the provider's session id (`sid`), which
 * front-channel logout names, and Entra's `login_hint`, sent back as `logout_hint`. A refresh
 * that does not repeat them keeps the values from sign-in.
 */
export function sessionClaims(claims: Record<string, unknown>, issuer: string, previous?: Pick<SessionTokens, 'providerSession' | 'loginHint'>): Pick<SessionTokens, 'providerSession' | 'loginHint'> {
  const sid = typeof claims.sid === 'string' && claims.sid ? claims.sid : undefined;
  const hint = typeof claims.login_hint === 'string' && claims.login_hint ? claims.login_hint : undefined;
  const providerSession = sid ? { issuer, sid } : previous?.providerSession;
  const loginHint = hint ?? previous?.loginHint;
  return {
    ...(providerSession ? { providerSession } : {}),
    ...(loginHint ? { loginHint } : {}),
  };
}
