// Validates agent clients' bearer tokens, separately from browser sessions and their key cache.
import { createRemoteJWKSet, customFetch, errors, jwtVerify, type JWTVerifyGetKey, type RemoteJWKSetOptions } from 'jose';
import { ClaimError, clientFromToken, type Principal } from './principal';
import type { ServerConfig } from '../config';

/** Why a bearer credential was refused, as recorded in the audit log. */
export type BearerRefusal = 'token-invalid' | 'tenant-mismatch' | 'provider-unreachable';

/** A bearer credential that does not establish a trusted application identity. */
export class BearerError extends Error {
  constructor(
    public readonly reason: BearerRefusal = 'token-invalid',
    cause?: unknown,
  ) {
    super('Invalid application bearer token.', { cause });
    this.name = 'BearerError';
  }
}

/** Checks a bearer header and returns the client principal its token names. */
export type BearerValidator = (authorization: string) => Promise<Principal>;

// Unknown signing keys trigger a key reload at most once per five minutes, so a flood of tokens
// with invented key ids cannot turn into a flood of requests to the provider.
const UNKNOWN_KEY_COOLDOWN_MS = 300_000;
const KEY_FETCH_TIMEOUT_MS = 5000;
const CLOCK_SKEW_SECONDS = 300;

/** Bearer tokens are accepted on the agent API only; anywhere else they are refused. */
export function acceptsBearer(pathname: string): boolean {
  return pathname.startsWith('/api/agent/');
}

/** True for a key lookup that failed because of the token, not because of the provider. */
function tokenKeyProblem(error: unknown): boolean {
  return error instanceof errors.JWKSNoMatchingKey || error instanceof errors.JWKSMultipleMatchingKeys || error instanceof errors.JOSENotSupported;
}

/**
 * Wraps the remote key set so a failure to fetch or read the provider's keys is reported as the
 * provider being unreachable. A key the token names but the set lacks is still the token's fault.
 */
function providerKeys(keys: JWTVerifyGetKey): JWTVerifyGetKey {
  return async (header, token) => {
    try {
      return await keys(header, token);
    } catch (error) {
      if (tokenKeyProblem(error)) throw error;
      throw new BearerError('provider-unreachable', error);
    }
  };
}

function asBearerError(error: unknown): BearerError {
  if (error instanceof BearerError) return error;
  if (error instanceof ClaimError) return new BearerError(error.reason, error);
  return new BearerError('token-invalid', error);
}

/**
 * Builds the validator for agent tokens from the provider's discovered key endpoint. Without a
 * configured API audience, every bearer token is refused.
 */
export function createBearerValidator(config: ServerConfig, jwksUri: string, fetchKeys?: RemoteJWKSetOptions[typeof customFetch]): BearerValidator {
  const remote = createRemoteJWKSet(new URL(jwksUri), {
    cooldownDuration: UNKNOWN_KEY_COOLDOWN_MS,
    timeoutDuration: KEY_FETCH_TIMEOUT_MS,
    [customFetch]: fetchKeys,
  });
  const keys = providerKeys(remote);
  return async authorization => {
    const token = /^Bearer (\S+)$/i.exec(authorization)?.[1];
    const audience = config.apiAudience;
    if (!token || audience.length === 0) throw new BearerError();
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer: config.oidc.issuer,
        audience,
        algorithms: ['RS256', 'ES256'],
        requiredClaims: ['exp'],
        clockTolerance: CLOCK_SKEW_SECONDS,
      });
      return clientFromToken(payload, config.oidc.tenantId);
    } catch (error) {
      throw asBearerError(error);
    }
  };
}
