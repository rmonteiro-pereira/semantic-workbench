// Runs sign-in tests against the mock provider in Entra's endpoint layout, which drives MSAL.
import type { ClientAuth, ServerConfig } from '../../src/server/config';
import type { SignInProvider } from '../../src/server/auth/sign-in-provider';
import { startMockOidc, type MockOidc, type MockOidcOptions } from './mock-oidc';
import { oidcConfig } from './server-auth';
import type { TestUserName } from './auth-identities';

/** Starts an Entra-shaped mock provider for one test and always stops it. */
export async function withEntraProvider(run: (provider: MockOidc) => Promise<void>, options: MockOidcOptions = {}) {
  const provider = await startMockOidc({ ...options, shape: 'entra', layout: 'entra' });
  try {
    await run(provider);
  } finally {
    await provider.stop();
  }
}

/** Server settings for the Entra mock, optionally with another client credential. */
export function entraConfig(provider: MockOidc, clientAuth?: ClientAuth): ServerConfig {
  const config = oidcConfig(provider.issuer, provider.graphUrl, 'entra');
  if (clientAuth) config.oidc.clientAuth = clientAuth;
  return config;
}

/** Signs a person in through a sign-in provider and the mock's authorization page. */
export async function signInWith(client: SignInProvider, provider: MockOidc, username: TestUserName = 'alice') {
  const started = await client.login('/');
  const callback = new URL(await provider.authorizeAs(username, started.url));
  return client.callback(callback, started.attempt);
}
