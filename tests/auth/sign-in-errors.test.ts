// Checks stable audit reasons independently of provider-controlled message text.
import { expect, test } from 'bun:test';
import * as oidc from 'openid-client';
import { errors } from 'jose';
import { ClaimError } from '../../src/server/auth/principal';
import { signInError } from '../../src/server/auth/oidc';
import { SignInError } from '../../src/server/auth/sign-in-error';

for (const [error, reason] of [
  [new ClaimError('private context', 'tenant-mismatch'), 'tenant-mismatch'],
  [new ClaimError('missing claim'), 'token-invalid'],
  [new errors.JWTExpired('private token', {}), 'token-invalid'],
  [new oidc.AuthorizationResponseError('denied', { cause: new URLSearchParams('error=denied') }), 'attempt-invalid'],
  [
    new oidc.ResponseBodyError('bad grant', {
      cause: { error: 'invalid_grant' },
      response: new Response(),
    }),
    'attempt-invalid',
  ],
  [new Error('tenant JWT state secret-code'), 'provider-unreachable'],
  [Object.assign(new oidc.ClientError('private transport context'), { code: 'OAUTH_TIMEOUT' }), 'provider-unreachable'],
  [new SignInError('attempt-invalid'), 'attempt-invalid'],
] as const) {
  test('maps typed ' + error.constructor.name + ' to ' + reason, () => {
    const failure = signInError(error);
    expect(failure.reason).toBe(reason);
    expect(failure.message).toBe(reason);
  });
}
