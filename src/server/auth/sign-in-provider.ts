// Names what every sign-in provider offers the server and picks the library for the configured
// provider: Entra signs in through MSAL, generic OpenID Connect and Keycloak through openid-client.
import type { ProviderKind, ServerConfig } from '../config';
import type { BearerValidator } from './bearer';
import { createMsalProvider } from './msal-provider';
import type { SignInAttempt } from './attempts';
import { createOidcClient } from './oidc';
import type { NormalizedPrincipal } from './principal';
import type { SessionTokens } from './sessions';

/** The HTTP edge towards the identity provider; tests pass an in-memory one. */
export type ProviderFetch = (url: string, init: RequestInit) => Promise<Response>;

/** A validated person and the provider tokens the server keeps in their session. */
export type SignInIdentity = { principal: NormalizedPrincipal; tokens: SessionTokens };

/** Where to send the browser, and the attempt to keep in the signed attempt cookie. */
export type SignInStart = { url: string; attempt: SignInAttempt };

/** A token another API accepts on a person's behalf, and when it expires (epoch milliseconds). */
export type DelegatedToken = { token: string; expiresAt: number };

/** Sign-in operations the authentication boundary uses, whichever library implements them. */
export type SignInProvider = {
  /** Validates agent clients' bearer tokens against the provider's keys. */
  bearer: BearerValidator;
  /** When the sign-in keys were last downloaded, for provider diagnostics. */
  readonly jwksRefreshedAt: string | null;
  /** Builds the provider's authorization URL with PKCE, state and nonce. */
  login(returnTo: string): Promise<SignInStart>;
  /** Exchanges the authorization code and validates the person it names. */
  callback(url: URL, attempt: SignInAttempt): Promise<SignInIdentity>;
  /** Renews the session's tokens and re-reads the person's current claims. */
  refresh(tokens: SessionTokens): Promise<SignInIdentity>;
  /**
   * The provider's sign-out URL, or the workbench's signed-out page when it has none. With the
   * session's tokens it names the account, so the provider need not ask which one.
   */
  logout(tokens?: SessionTokens): string;
  /** An application token for Microsoft Graph group lookups. */
  directoryToken(): Promise<string>;
  /** Exchanges a person's access token for a token to another API on their behalf. */
  onBehalfOf(userToken: string, scopes: string[]): Promise<DelegatedToken>;
};

/** Edges a sign-in provider needs; each defaults to the real one. */
export type SignInDependencies = {
  /** Gets the platform's federated assertion when `SW_OIDC_CLIENT_ASSERTION=managed-identity`. */
  assertion?: () => Promise<string>;
  now?: () => number;
  fetch?: ProviderFetch;
};

/** The library that signs people in for a provider kind. */
export type SignInLibrary = 'msal' | 'openid-client';

/** Entra uses Microsoft's library; every other provider uses the generic OpenID client. */
export function signInLibrary(provider: ProviderKind): SignInLibrary {
  return provider === 'entra' ? 'msal' : 'openid-client';
}

/** Discovers the configured provider and returns its sign-in operations. */
export async function createSignInProvider(config: ServerConfig, dependencies: SignInDependencies = {}): Promise<SignInProvider> {
  if (signInLibrary(config.oidc.provider) === 'msal') {
    return createMsalProvider(config, dependencies);
  }
  return createOidcClient(config, dependencies);
}
