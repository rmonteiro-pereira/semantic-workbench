// Keeps provider diagnostics out of audit vocabulary and browser responses.
/** Stable reasons shared by protocol validation and authentication audits. */
export type SignInReason =
  | 'tenant-mismatch'
  | 'attempt-invalid'
  | 'token-invalid'
  | 'provider-unreachable';

/** A safe authentication failure with no provider tokens or authorization codes. */
export class SignInError extends Error {
  /** The underlying failure is kept as the cause so operators can read it in the server log. */
  constructor(
    public readonly reason: SignInReason,
    public readonly returnTo = '/',
    cause?: unknown,
  ) {
    super(reason, cause === undefined ? undefined : { cause });
  }
}
