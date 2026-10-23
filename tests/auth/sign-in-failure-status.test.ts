// A failed sign-in is a failed request: the page explains it, and the status says so.
import { beforeAll, expect, spyOn, test } from 'bun:test';
import { useDefaultBrand } from '../helpers/brand-fixture';
import { SignInError, type SignInReason } from '../../server/auth/sign-in-error';
import { signInContext } from '../helpers/sign-in-context';

beforeAll(useDefaultBrand);

async function failedCallback(reason: SignInReason) {
  using context = await signInContext();
  const log = spyOn(console, 'error').mockImplementation(() => {});
  const callback = spyOn(context.client, 'callback').mockRejectedValue(new SignInError(reason));
  try {
    const first = await context.handler(new Request(context.origin + '/auth/login'));
    const attempt = first.headers.getSetCookie()[0].split(';')[0];
    const url = context.transport.authorize(first.headers.get('location')!, 'bob');
    return await context.handler(new Request(url, { headers: { Cookie: attempt } }));
  } finally {
    callback.mockRestore();
    log.mockRestore();
  }
}

test('a callback without a sign-in attempt answers 400', async () => {
  using context = await signInContext();
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try {
    const response = await context.handler(new Request(context.origin + '/auth/callback?code=x'));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('Expired or replayed sign-in attempt');
  } finally {
    log.mockRestore();
  }
});

test('an invalid token and a foreign tenant answer 400', async () => {
  for (const reason of ['token-invalid', 'tenant-mismatch'] as const) {
    const response = await failedCallback(reason);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('Try again');
  }
});

test('an unreachable provider answers 503, at the callback and at the start', async () => {
  expect((await failedCallback('provider-unreachable')).status).toBe(503);
  using context = await signInContext();
  const log = spyOn(console, 'error').mockImplementation(() => {});
  const login = spyOn(context.client, 'login').mockRejectedValue(new Error('connect ECONNREFUSED'));
  try {
    const response = await context.handler(new Request(context.origin + '/auth/login'));
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('Provider unreachable');
  } finally {
    login.mockRestore();
    log.mockRestore();
  }
});

test('the other reasons keep a plain page', async () => {
  expect((await failedCallback('provider-unsupported')).status).toBe(200);
});
