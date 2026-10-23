// A provider outage during token refresh must not sign anyone out; a refusal of the token must.
import { expect, spyOn, test } from 'bun:test';
import { SignInError, type SignInReason } from '../../server/auth/sign-in-error';
import { sessionCookieOf, signInContext } from '../helpers/sign-in-context';

async function expiredSession() {
  const context = await signInContext();
  const cookie = sessionCookieOf(await context.signIn());
  const id = cookie.split('=')[1];
  const sessions = context.auth.authentication.sessions;
  const session = (await sessions.get(id))!;
  session.tokens.expiresAt = 0;
  await sessions.update(session);
  const me = () =>
    context.handler(new Request(context.origin + '/api/me', { headers: { Cookie: cookie } }));
  return { context, id, me, sessions };
}

test('while the provider is unreachable the request gets 503 and the session stays', async () => {
  const { context, id, me, sessions } = await expiredSession();
  using _context = context;
  const log = spyOn(console, 'error').mockImplementation(() => {});
  const refresh = spyOn(context.client, 'refresh').mockRejectedValue(
    new SignInError('provider-unreachable'),
  );
  try {
    const outage = await me();
    expect(outage.status).toBe(503);
    expect(await sessions.get(id, false)).not.toBeNull();
    const second = await me();
    expect(second.status).toBe(503);
    refresh.mockRestore();
    const recovered = await me();
    expect(recovered.status).toBe(200);
  } finally {
    refresh.mockRestore();
    log.mockRestore();
  }
});

test('an unexpected failure of the refresh is treated as an outage, not a sign-out', async () => {
  const { context, id, me, sessions } = await expiredSession();
  using _context = context;
  const log = spyOn(console, 'error').mockImplementation(() => {});
  const refresh = spyOn(context.client, 'refresh').mockRejectedValue(new Error('socket hang up'));
  try {
    expect((await me()).status).toBe(503);
    expect(await sessions.get(id, false)).not.toBeNull();
  } finally {
    refresh.mockRestore();
    log.mockRestore();
  }
});

const endingReasons: SignInReason[] = [
  'token-invalid',
  'attempt-invalid',
  'session-upgraded',
  'tenant-mismatch',
];

for (const reason of endingReasons) {
  test(`a refresh refused as ${reason} ends the session`, async () => {
    const { context, id, me, sessions } = await expiredSession();
    using _context = context;
    const log = spyOn(console, 'error').mockImplementation(() => {});
    const refresh = spyOn(context.client, 'refresh').mockRejectedValue(new SignInError(reason));
    try {
      expect((await me()).status).toBe(401);
      expect(await sessions.get(id, false)).toBeNull();
    } finally {
      refresh.mockRestore();
      log.mockRestore();
    }
  });
}

test('a refresh that returns another person ends the session', async () => {
  const { context, id, me, sessions } = await expiredSession();
  using _context = context;
  const log = spyOn(console, 'error').mockImplementation(() => {});
  const refresh = spyOn(context.client, 'refresh').mockImplementation(async tokens => {
    const real = (await sessions.get(id, false))!;
    return { principal: { ...real.principal, id: 'someone-else' }, tokens };
  });
  try {
    expect((await me()).status).toBe(401);
    expect(await sessions.get(id, false)).toBeNull();
  } finally {
    refresh.mockRestore();
    log.mockRestore();
  }
});

test('a failure after the provider answered is an internal error and keeps the session', async () => {
  const { context, id, me, sessions } = await expiredSession();
  using _context = context;
  const log = spyOn(console, 'error').mockImplementation(() => {});
  const update = spyOn(sessions, 'update').mockRejectedValue(new Error('disk full'));
  try {
    const response = await me();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal error.' });
    expect(await sessions.get(id, false)).not.toBeNull();
  } finally {
    update.mockRestore();
    log.mockRestore();
  }
});
