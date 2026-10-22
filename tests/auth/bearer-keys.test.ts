// Checks the real remote key cache through a controlled HTTP edge without opening sockets.
import { expect, test, spyOn } from 'bun:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { BearerError, createBearerValidator } from '../../server/auth/bearer';
import { oidcConfig } from '../helpers/server-auth';
import { TEST_TENANT_ID } from '../helpers/auth-identities';

async function fixture(algorithm = 'RS256') {
  const config = oidcConfig('http://127.0.0.1:4444/issuer', 'http://127.0.0.1:4444/graph');
  config.apiAudience = ['api://semantic-workbench'];
  const key = await generateKeyPair(algorithm);
  const jwk = { ...(await exportJWK(key.publicKey)), kid: 'one', alg: algorithm };
  let requests = 0;
  const validator = createBearerValidator(config, config.oidc.issuer + '/keys', async () => {
    requests++;
    return Response.json({ keys: [jwk] });
  });
  async function token(kid = 'one') {
    return (
      'Bearer ' +
      (await new SignJWT({
        idtyp: 'app',
        azp: 'sw-agent',
        tid: TEST_TENANT_ID,
      })
        .setProtectedHeader({ alg: algorithm, kid })
        .setIssuer(config.oidc.issuer)
        .setAudience(config.apiAudience[0])
        .setExpirationTime('1h')
        .sign(key.privateKey))
    );
  }
  return {
    validator,
    token,
    requests: () => requests,
    rotate: () => {
      jwk.kid = 'two';
    },
    disable: () => {
      config.apiAudience = [];
    },
  };
}

test('remote JWKS cache suppresses unknown-key refreshes for five minutes', async () => {
  const app = await fixture();
  expect((await app.validator(await app.token())).clientId).toBe('sw-agent');
  expect((await app.validator(await app.token())).clientId).toBe('sw-agent');
  for (let index = 0; index < 3; index++) {
    await expect(app.validator(await app.token('unknown'))).rejects.toThrow();
  }
  expect(app.requests()).toBe(1);
});

test('ES256 is accepted and other asymmetric algorithms are refused', async () => {
  const allowed = await fixture('ES256');
  expect((await allowed.validator(await allowed.token())).kind).toBe('client');
  const denied = await fixture('PS256');
  await expect(denied.validator(await denied.token())).rejects.toThrow();
  expect(denied.requests()).toBe(0);
});

test('unknown signing keys refresh only after the five-minute cooldown', async () => {
  const app = await fixture();
  const started = Date.now();
  const clock = spyOn(Date, 'now').mockReturnValue(started);
  try {
    await app.validator(await app.token());
    app.rotate();
    clock.mockReturnValue(started + 299_999);
    await expect(app.validator(await app.token('two'))).rejects.toThrow();
    expect(app.requests()).toBe(1);
    clock.mockReturnValue(started + 300_000);
    expect((await app.validator(await app.token('two'))).kind).toBe('client');
    expect(app.requests()).toBe(2);
  } finally {
    clock.mockRestore();
  }
});

test('missing API audience disables machine credentials without fetching keys', async () => {
  const app = await fixture();
  const token = await app.token();
  app.disable();
  await expect(app.validator(token)).rejects.toThrow();
  expect(app.requests()).toBe(0);
});

/** A validator whose key endpoint answers with the given response, or fails to answer. */
function validatorWithKeys(answer: () => Promise<Response>) {
  const config = oidcConfig('http://127.0.0.1:4444/issuer', 'http://127.0.0.1:4444/graph');
  config.apiAudience = ['api://semantic-workbench'];
  return createBearerValidator(config, config.oidc.issuer + '/keys', answer);
}

async function refusalReason(validation: Promise<unknown>) {
  const refusal: unknown = await validation.catch(error => error);
  expect(refusal).toBeInstanceOf(BearerError);
  return (refusal as BearerError).reason;
}

test('a failing key endpoint means the provider is unreachable, whatever it answers', async () => {
  const app = await fixture();
  const token = await app.token();
  const answers = [
    async () => {
      throw new TypeError('connection refused');
    },
    async () => new Response('down', { status: 502 }),
    async () => new Response('<html>not keys</html>', { status: 200 }),
    async () => Response.json({ keys: 'not a list' }),
  ];
  for (const answer of answers) {
    expect(await refusalReason(validatorWithKeys(answer)(token))).toBe('provider-unreachable');
  }
});

test('problems of the token itself stay invalid tokens', async () => {
  const app = await fixture();
  expect(await refusalReason(app.validator('Bearer not-a-token'))).toBe('token-invalid');
  expect(await refusalReason(app.validator(await app.token('unknown')))).toBe('token-invalid');
});
