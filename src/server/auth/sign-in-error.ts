// Keeps provider diagnostics out of audit vocabulary and browser responses.
import { errors } from 'jose';
import { ClaimError } from './principal';

/** Stable reasons shared by protocol validation and authentication audits. */
export type SignInReason =
  | 'tenant-mismatch'
  | 'attempt-invalid'
  | 'token-invalid'
  | 'provider-unreachable'
  | 'provider-unsupported'
  | 'session-upgraded';

/** A safe authentication failure with no provider tokens or authorization codes. */
export class SignInError extends Error {
  /**
   * The underlying failure is kept as the cause. Only `providerCode`, the OAuth error the
   * provider returned, reaches the server log: other error text can quote request data such as
   * an authorization code.
   */
  constructor(
    public readonly reason: SignInReason,
    public readonly returnTo = '/',
    cause?: unknown,
    public readonly providerCode?: string,
  ) {
    super(reason, cause === undefined ? undefined : { cause });
  }
}

/**
 * Maps the failures both sign-in libraries share, a refused claim or a bad token signature, to
 * their reasons. Returns undefined for anything else, which each library maps itself.
 */
export function tokenSignInError(error: unknown): SignInError | undefined {
  if (error instanceof SignInError) return error;
  if (error instanceof ClaimError) {
    const reason = error.reason === 'tenant-mismatch' ? 'tenant-mismatch' : 'token-invalid';
    return new SignInError(reason, '/', error);
  }
  if (error instanceof errors.JOSEError) return new SignInError('token-invalid', '/', error);
  return undefined;
}

/**
 * Any failure as a sign-in error. Each provider already maps its own library's errors, so what
 * is left keeps a shared reason or means the provider could not be reached.
 */
export function asSignInError(error: unknown): SignInError {
  return tokenSignInError(error) ?? new SignInError('provider-unreachable', '/', error);
}
