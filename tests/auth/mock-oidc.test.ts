// Exercises the mock provider through HTTP and checks the portable Keycloak directory fixture.
import { expect, test } from 'bun:test';
import { createRemoteJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify } from 'jose';
import { TEST_CLIENTS, TEST_GROUPS, TEST_TENANT_ID, TEST_USERS, TEST_WORKBENCH_CLIENT } from '../helpers/auth-identities';
import { authorization, callback, graphCheck, graphToken, signedOut, signIn, tokenRequest, withProvider } from './mock-oidc-client';

test('Discovery advertises the issuer endpoints and supported protocol features', () =>
  withProvider(async provider => {
    const document = await (await fetch(`${provider.issuer}/.well-known/openid-configuration`)).json();
    expect(document).toMatchObject({
      issuer: provider.issuer,
      authorization_endpoint: `${provider.issuer}/authorize`,
      token_endpoint: `${provider.issuer}/token`,
      jwks_uri: `${provider.issuer}/keys`,
      end_session_endpoint: `${provider.issuer}/logout`,
      userinfo_endpoint: `${provider.issuer}/userinfo`,
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials', 'urn:ietf:params:oauth:grant-type:jwt-bearer'],
    });
  }));

test('Authorization refuses missing or weak PKCE and unregistered clients or redirects', () =>
  withProvider(async provider => {
    const { url } = await authorization(provider);
    for (const [name, value] of [
      ['code_challenge', ''],
      ['code_challenge_method', 'plain'],
      ['redirect_uri', 'https://example.org/callback'],
      ['client_id', 'unknown'],
      ['state', ''],
      ['nonce', ''],
      ['response_type', 'token'],
    ]) {
      const invalid = new URL(url);
      invalid.searchParams.set(name, value);
      const response = await fetch(invalid, { redirect: 'manual' });
      expect(response.status).toBe(400);
      expect(await response.text()).not.toBe('');
    }
  }));

test('The browser chooser preserves authorization parameters and submits the chosen user', () =>
  withProvider(async provider => {
    const { url } = await authorization(provider);
    const page = await (await fetch(url)).text();
    expect(page).toContain('<h1>Mock sign-in</h1>');
    for (const user of Object.values(TEST_USERS)) {
      expect(page).toContain(`<button name="username" value="${user.username}">${user.name}</button>`);
    }
    const params = new URLSearchParams(url.search);
    params.set('username', 'bob');
    const response = await fetch(`${provider.issuer}/authorize`, {
      method: 'POST',
      body: params,
      redirect: 'manual',
    });
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('location')!).searchParams.get('state')).toBe(params.get('state'));
  }));

test('A complete OpenID client flow verifies Alice and her Entra group claims', () =>
  withProvider(async provider => {
    const tokens = await signIn(provider);
    expect(tokens.claims()).toMatchObject({
      iss: provider.issuer,
      aud: TEST_WORKBENCH_CLIENT.clientId,
      oid: TEST_USERS.alice.oid,
      tid: TEST_TENANT_ID,
      xms_edov: true,
      groups: [TEST_GROUPS.salesEditors.id],
      name: TEST_USERS.alice.name,
    });
    expect(decodeJwt(tokens.access_token)).toMatchObject({
      aud: provider.apiAudience,
      oid: TEST_USERS.alice.oid,
      scp: 'openid profile email offline_access',
    });
    const keys = createRemoteJWKSet(new URL(`${provider.issuer}/keys`));
    await jwtVerify(tokens.id_token!, keys, { issuer: provider.issuer });
  }));

test('A wrong verifier is refused and a successful authorization code cannot be reused', () =>
  withProvider(async provider => {
    const wrong = await authorization(provider);
    const wrongResponse = await tokenRequest(provider, {
      grant_type: 'authorization_code',
      code: wrong.redirect.searchParams.get('code')!,
      redirect_uri: callback,
      code_verifier: 'wrong',
    });
    expect(wrongResponse.status).toBe(400);
    expect((await wrongResponse.json()).error).toBe('invalid_grant');
    const flow = await authorization(provider);
    const params = {
      grant_type: 'authorization_code',
      code: flow.redirect.searchParams.get('code')!,
      redirect_uri: callback,
      code_verifier: flow.verifier,
    };
    expect((await tokenRequest(provider, params)).status).toBe(200);
    expect((await tokenRequest(provider, params)).status).toBe(400);
  }));

test('Entra preserves mixed case email guest addresses app roles and group overage', () =>
  withProvider(async provider => {
    expect((await signIn(provider, 'bob')).claims()?.email).toBe('Bob@Example.org');
    const guest = (await signIn(provider, 'gina')).claims()!;
    expect(guest).not.toHaveProperty('xms_edov');
    expect(guest.upn).toContain('#EXT#');
    expect((await signIn(provider, 'erin')).claims()?.roles).toEqual(['Admin']);
    const overage = (await signIn(provider, 'olga')).claims()!;
    expect(overage).not.toHaveProperty('groups');
    expect(overage._claim_names).toEqual({ groups: 'src1' });
    expect(overage._claim_sources).toEqual({
      src1: {
        endpoint: `${provider.graphUrl}/v1.0/users/${TEST_USERS.olga.oid}/getMemberObjects`,
      },
    });
  }));

test('Refresh rotates credentials and uses current groups and email', () =>
  withProvider(async provider => {
    const tokens = await signIn(provider);
    provider.setUserGroups('alice', [TEST_GROUPS.finance]);
    provider.setUserEmail('alice', { email: 'changed@example.org', emailDomainVerified: false });
    const params = { grant_type: 'refresh_token', refresh_token: tokens.refresh_token! };
    const response = await tokenRequest(provider, params);
    expect(response.status).toBe(200);
    const refreshed = await response.json();
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);
    const claims = decodeJwt(refreshed.id_token);
    expect(claims.groups).toEqual([TEST_GROUPS.finance.id]);
    expect(claims.email).toBe('changed@example.org');
    expect(claims).not.toHaveProperty('xms_edov');
    expect(claims).not.toHaveProperty('nonce');
    expect((await tokenRequest(provider, params)).status).toBe(400);
    expect(TEST_USERS.alice.email).toBe('alice@example.org');
    expect(TEST_USERS.alice.groups).toEqual([TEST_GROUPS.salesEditors]);
  }));

test('Key rotation publishes both keys and makes a cached verifier refetch for the new key', () =>
  withProvider(async provider => {
    const keys = createRemoteJWKSet(new URL(`${provider.issuer}/keys`), { cooldownDuration: 0 });
    const before = await signIn(provider);
    expect(decodeProtectedHeader(before.id_token!).kid).toBe('k1');
    await jwtVerify(before.id_token!, keys);
    expect(keys.jwks()?.keys.map(key => key.kid)).toEqual(['k1']);
    provider.rotateKeys();
    const after = await signIn(provider);
    expect(decodeProtectedHeader(after.id_token!).kid).toBe('k2');
    await jwtVerify(after.id_token!, keys);
    expect(keys.jwks()?.keys.map(key => key.kid)).toEqual(['k1', 'k2']);
    await jwtVerify(before.id_token!, keys);
  }));

test('Agent client credentials identify the application and reject incorrect secrets', () =>
  withProvider(async provider => {
    const params = { grant_type: 'client_credentials', scope: `${provider.apiAudience}/.default` };
    const response = await tokenRequest(provider, params, TEST_CLIENTS.granted);
    const claims = decodeJwt((await response.json()).access_token);
    expect(claims).toMatchObject({
      idtyp: 'app',
      azp: 'sw-agent',
      appid: 'sw-agent',
      tid: TEST_TENANT_ID,
    });
    expect(claims.sub).toBe(String(claims.oid));
    expect(claims).not.toHaveProperty('roles');
    const denied = await tokenRequest(provider, { ...params, client_secret: 'wrong' });
    expect(denied.status).toBe(401);
    expect((await denied.json()).error).toBe('invalid_client');
  }));

test('Graph requires its application token and matches group ids case insensitively', () =>
  withProvider(async provider => {
    expect((await graphCheck(provider)).status).toBe(401);
    const token = await graphToken(provider);
    const id = TEST_GROUPS.salesEditors.id.toUpperCase();
    expect(await (await graphCheck(provider, token, [id, TEST_GROUPS.finance.id])).json()).toEqual({
      value: [id],
    });
    expect((await graphCheck(provider, token, Array(21).fill(id))).status).toBe(400);
    const user = await signIn(provider);
    expect((await graphCheck(provider, user.access_token)).status).toBe(401);
    provider.fail('graph-check', 'error');
    expect((await graphCheck(provider, token)).status).toBe(500);
    provider.fail('graph-check', null);
    expect((await graphCheck(provider, token)).status).toBe(200);
  }));

test('Graph resolves known group display names and returns not found for unknown groups', () =>
  withProvider(async provider => {
    const headers = { authorization: `Bearer ${await graphToken(provider)}` };
    const base = `${provider.graphUrl}/v1.0/groups`;
    const response = await fetch(`${base}/${TEST_GROUPS.salesEditors.id}?$select=displayName`, {
      headers,
    });
    expect(await response.json()).toEqual({
      id: TEST_GROUPS.salesEditors.id,
      displayName: TEST_GROUPS.salesEditors.name,
    });
    expect((await fetch(`${base}/unknown`, { headers })).status).toBe(404);
    expect((await fetch(`${base}/${TEST_GROUPS.salesEditors.id}`)).status).toBe(401);
  }));

test('Logout redirects only to an exact registered destination and preserves state', () =>
  withProvider(async provider => {
    for (const uri of [signedOut, `${signedOut}/extra`, 'https://example.org']) {
      const params = new URLSearchParams({ post_logout_redirect_uri: uri, state: 'logout-state' });
      const response = await fetch(`${provider.issuer}/logout?${params}`, { redirect: 'manual' });
      if (uri === signedOut) {
        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe(`${signedOut}?state=logout-state`);
      } else {
        expect(response.status).toBe(200);
        expect(await response.text()).toContain('You are signed out of the mock provider');
      }
    }
  }));

for (const shape of ['keycloak', 'generic'] as const) {
  test(`The ${shape} shape provides group names and verified email without Entra claims`, () =>
    withProvider(
      async provider => {
        const claims = (await signIn(provider)).claims()!;
        expect(claims.groups).toEqual([TEST_GROUPS.salesEditors.name]);
        expect(claims.email_verified).toBe(true);
        for (const name of ['oid', 'tid', 'roles']) expect(claims).not.toHaveProperty(name);
        if (shape === 'keycloak') expect(claims.sub).toMatch(/^[\da-f-]{36}$/);
        else expect(claims.sub).toBe('alice');
        expect((await signIn(provider, 'gina')).claims()?.email_verified).toBe(false);
      },
      { shape },
    ));
}

test('On behalf of exchange and userinfo retain the user while rejecting unsuitable tokens', () =>
  withProvider(async provider => {
    const user = await signIn(provider);
    const params = {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      requested_token_use: 'on_behalf_of',
      assertion: user.access_token,
      scope: 'https://service.example/read',
    };
    const response = await tokenRequest(provider, params);
    expect(response.status).toBe(200);
    expect(decodeJwt((await response.json()).access_token)).toMatchObject({
      aud: 'https://service.example',
      oid: TEST_USERS.alice.oid,
      tid: TEST_TENANT_ID,
      name: TEST_USERS.alice.name,
      upn: TEST_USERS.alice.upn,
    });
    expect((await tokenRequest(provider, { ...params, assertion: user.id_token! })).status).toBe(400);
    provider.setUserEmail('alice', { email: 'new@example.org' });
    const info = await fetch(`${provider.issuer}/userinfo`, {
      headers: { authorization: `Bearer ${user.access_token}` },
    });
    expect((await info.json()).email).toBe('new@example.org');
    const history = JSON.stringify(provider.calls);
    for (const secret of [TEST_WORKBENCH_CLIENT.secret, user.access_token, user.refresh_token!]) {
      expect(history).not.toContain(secret);
    }
  }));

test('The alternate overage style emits hasgroups without group claims', () =>
  withProvider(
    async provider => {
      const claims = (await signIn(provider, 'olga')).claims()!;
      expect(claims.hasgroups).toBe(true);
      expect(claims).not.toHaveProperty('groups');
      expect(claims).not.toHaveProperty('_claim_names');
    },
    { overageStyle: 'hasgroups' },
  ));

async function runnerReady(output: ReadableStream<Uint8Array>) {
  const reader = output.getReader();
  const decoder = new TextDecoder();
  let line = '';
  try {
    while (!line.includes('\n')) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error('Runner exited before reporting its endpoints');
      line += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(line.split('\n')[0]);
  } finally {
    reader.releaseLock();
  }
}

test('The runner reports its loopback endpoints and exits cleanly on termination', async () => {
  const child = Bun.spawn([process.execPath, 'scripts/mock-oidc.ts', '--port', '0'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  try {
    const ready = await runnerReady(child.stdout);
    expect(ready.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(ready.issuer).toBe(`${ready.origin}/${TEST_TENANT_ID}/v2.0`);
    expect(ready.graphUrl).toBe(`${ready.origin}/graph`);
    expect((await fetch(`${ready.issuer}/keys`)).status).toBe(200);
    child.kill('SIGTERM');
    expect(await child.exited).toBe(0);
  } finally {
    child.kill();
    await child.exited;
  }
});

test('The Keycloak realm matches the shared directory and clients without roles', async () => {
  const realm = await Bun.file(new URL('../fixtures/keycloak/realm.json', import.meta.url)).json();
  expect(realm).toMatchObject({ realm: 'workbench', enabled: true, sslRequired: 'none' });
  expect(realm.groups.map((group: { name: string }) => group.name).sort()).toEqual(
    Object.values(TEST_GROUPS)
      .map(group => group.name)
      .sort(),
  );
  const people = Object.values(TEST_USERS).filter(user => user.username !== 'olga');
  expect(realm.users.map((user: { username: string }) => user.username).sort()).toEqual(people.map(user => user.username).sort());
  for (const person of people) {
    const user = realm.users.find((entry: { username: string }) => entry.username === person.username);
    expect(`${user.firstName} ${user.lastName}`).toBe(person.name);
    expect(user.enabled).toBe(true);
    expect(user.email).toBe(person.email);
    expect(user.emailVerified).toBe(person.emailVerified);
    expect(user.groups).toEqual(person.groups.map(group => `/${group.name}`));
    expect(user.credentials).toEqual([{ type: 'password', value: `test-${person.username}`, temporary: false }]);
    expect(user).not.toHaveProperty('clientRoles');
    // Offline access only lets Keycloak issue the refresh token the workbench asks for; it is not
    // a workbench role, which comes from grants alone.
    expect(user.realmRoles).toEqual(['offline_access']);
  }
  expect(realm).not.toHaveProperty('roles');
  expect(realm.clients).toHaveLength(3);
  for (const client of [TEST_WORKBENCH_CLIENT, ...Object.values(TEST_CLIENTS)]) {
    const entry = realm.clients.find((item: { clientId: string }) => item.clientId === client.clientId);
    expect(entry).toMatchObject({
      secret: client.secret,
      publicClient: false,
      clientAuthenticatorType: 'client-secret',
      directAccessGrantsEnabled: false,
    });
    expect(entry).not.toHaveProperty('roles');
    expect(entry.protocolMappers.some((mapper: { protocolMapper: string }) => mapper.protocolMapper === 'oidc-audience-mapper')).toBe(true);
  }
});
