// Checks the decisions of the MSAL provider without a provider: which authority and endpoints it
// trusts, how credentials map to MSAL, how failures map to sign-in reasons, and its HTTP edge.
import { expect, test } from 'bun:test';
import { AuthError, ServerError } from '@azure/msal-node';
import {
  authorizationCode,
  createMsalProvider,
  entraAuthority,
  entraMetadata,
  msalCredential,
  msalSignInError,
  providerNetwork,
  sessionTokenCache,
} from '../../server/auth/msal-provider';
import { providerDetail } from '../../server/auth/authentication';
import { ClaimError } from '../../server/auth/principal';
import { TEST_TENANT_ID } from '../helpers/auth-identities';
import { oidcConfig } from '../helpers/server-auth';

const tenant = TEST_TENANT_ID;
const issuer = `https://login.microsoftonline.com/${tenant}/v2.0`;

test('the MSAL authority is the configured tenant on a Microsoft sign-in host', () => {
  expect(entraAuthority(issuer, tenant)).toEqual({
    url: `https://login.microsoftonline.com/${tenant}`,
    host: 'login.microsoftonline.com',
  });
  const government = `https://login.microsoftonline.us/${tenant}/v2.0`;
  expect(entraAuthority(government, tenant).host).toBe('login.microsoftonline.us');
  const china = `https://login.partner.microsoftonline.cn/${tenant}/v2.0`;
  expect(entraAuthority(china, tenant).host).toBe('login.partner.microsoftonline.cn');
  const port = `https://login.microsoftonline.com:8443/${tenant}/v2.0`;
  expect(() => entraAuthority(port, tenant)).toThrow();
  const mock = `http://127.0.0.1:4400/${tenant}/v2.0`;
  expect(entraAuthority(mock, tenant).url).toBe(`https://127.0.0.1:4400/${tenant}`);
  expect(() => entraAuthority(`https://login.example.org/${tenant}/v2.0`, tenant)).toThrow();
  expect(() => entraAuthority(`http://login.microsoftonline.com/${tenant}/v2.0`, tenant)).toThrow();
  expect(() => entraAuthority(`https://login.microsoftonline.com/other/v2.0`, tenant)).toThrow();
  expect(() => entraAuthority(`https://login.microsoftonline.com/${tenant}`, tenant)).toThrow();
});

test('discovery is trusted only for the configured issuer with endpoints on its host', () => {
  const document = {
    issuer,
    authorization_endpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    token_endpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    jwks_uri: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
    end_session_endpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/logout`,
    userinfo_endpoint: 'https://graph.microsoft.com/oidc/userinfo',
  };
  const { userinfo_endpoint: _userinfo, ...expected } = document;
  expect(entraMetadata(document, issuer)).toEqual(expected);
  expect(() => entraMetadata({ ...document, issuer: 'https://other/v2.0' }, issuer)).toThrow();
  const elsewhere = { ...document, token_endpoint: 'https://attacker.example/token' };
  expect(() => entraMetadata(elsewhere, issuer)).toThrow('token_endpoint');
  const signOut = { ...document, end_session_endpoint: 'https://attacker.example/logout' };
  expect(() => entraMetadata(signOut, issuer)).toThrow('end_session_endpoint');
  expect(() => entraMetadata(null, issuer)).toThrow();
});

test('start-up stops when the discovery document names another issuer', async () => {
  const config = oidcConfig(`http://127.0.0.1:4400/${tenant}/v2.0`, 'http://127.0.0.1:4400/graph');
  const request = async () => Response.json({ issuer: 'http://127.0.0.1:4400/elsewhere' });
  await expect(createMsalProvider(config, { fetch: request })).rejects.toThrow('another issuer');
  const unavailable = async () => new Response('down', { status: 503 });
  await expect(createMsalProvider(config, { fetch: unavailable })).rejects.toThrow('unavailable');
});

test('credentials map to MSAL: a certificate by thumbprint, a secret, or the platform assertion', async () => {
  const privateKey = '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----';
  const sha256 = 'a'.repeat(64);
  const sha1 = 'b'.repeat(40);
  const assertion = async () => 'platform-assertion';
  const modern = msalCredential({ kind: 'certificate', privateKey, thumbprint: sha256 }, assertion);
  expect(modern).toEqual({ clientCertificate: { privateKey, thumbprintSha256: sha256 } });
  const legacy = msalCredential({ kind: 'certificate', privateKey, thumbprint: sha1 }, assertion);
  expect(legacy).toEqual({ clientCertificate: { privateKey, thumbprint: sha1 } });
  expect(msalCredential({ kind: 'secret', secret: 'value' }, assertion)).toEqual({
    clientSecret: 'value',
  });
  const managed = msalCredential({ kind: 'managed-identity' }, assertion);
  const callback = managed.clientAssertion as () => Promise<string>;
  expect(await callback()).toBe('platform-assertion');
  expect(() => msalCredential({ kind: 'private-key', keyPath: '/key.pem' }, assertion)).toThrow();
});

test('MSAL failures map to the same safe sign-in reasons as openid-client', () => {
  expect(msalSignInError(new ServerError('invalid_grant', '')).reason).toBe('attempt-invalid');
  expect(msalSignInError(new AuthError('state_mismatch', '')).reason).toBe('attempt-invalid');
  expect(msalSignInError(new AuthError('nonce_mismatch', '')).reason).toBe('attempt-invalid');
  expect(msalSignInError(new AuthError('network_error', '')).reason).toBe('provider-unreachable');
  const tenantError = new ClaimError('other tenant', 'tenant-mismatch');
  expect(msalSignInError(tenantError).reason).toBe('tenant-mismatch');
  const refused = msalSignInError(new ServerError('invalid_grant', '', 'quotes code xyz'));
  expect(providerDetail(refused)).toBe(' (invalid_grant)');
});

test('the callback must carry a code and no error', () => {
  const callback = 'http://127.0.0.1:4310/auth/callback';
  expect(authorizationCode(new URL(callback + '?code=abc&state=s'))).toBe('abc');
  expect(() => authorizationCode(new URL(callback + '?state=s'))).toThrow('attempt-invalid');
  expect(() => authorizationCode(new URL(callback + '?code=abc&error=denied'))).toThrow();
});

test('the session cache plugin reads and writes only the session it was given', async () => {
  const cache = { serialized: '{"Account":{}}' };
  const plugin = sessionTokenCache(cache);
  let loaded = '';
  const tokenCache = {
    deserialize: (value: string) => {
      loaded = value;
    },
    serialize: () => '{"Account":{"one":{}}}',
  };
  const context = (changed: boolean) =>
    ({ tokenCache, cacheHasChanged: changed }) as unknown as Parameters<
      typeof plugin.beforeCacheAccess
    >[0];
  await plugin.beforeCacheAccess(context(false));
  expect(loaded).toBe('{"Account":{}}');
  await plugin.afterCacheAccess(context(false));
  expect(cache.serialized).toBe('{"Account":{}}');
  await plugin.afterCacheAccess(context(true));
  expect(cache.serialized).toBe('{"Account":{"one":{}}}');
});

test('MSAL requests go through the provider fetch without following redirects', async () => {
  const seen: RequestInit[] = [];
  const request = async (_url: string, init?: RequestInit) => {
    seen.push(init!);
    return Response.json({ token_type: 'Bearer' }, { headers: { 'x-ms-request-id': 'r1' } });
  };
  const network = providerNetwork(request);
  const response = await network.sendPostRequestAsync<{ token_type: string }>('https://t', {
    body: 'grant_type=client_credentials',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  expect(response.status).toBe(200);
  expect(response.body.token_type).toBe('Bearer');
  expect(response.headers['x-ms-request-id']).toBe('r1');
  expect(seen[0].redirect).toBe('error');
  expect(seen[0].method).toBe('POST');
  expect(seen[0].signal).toBeInstanceOf(AbortSignal);
});
