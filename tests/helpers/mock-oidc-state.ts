// Holds isolated provider state and builds signed claims for each directory shape.
import { createHash } from 'node:crypto';
import { exportJWK, generateKeyPair, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import {
  TEST_TENANT_ID,
  TEST_USERS,
  TEST_WORKBENCH_CLIENT,
  type TestUser,
} from './auth-identities';

/** Directory conventions used in identity claims. */
export type ClaimShape = 'entra' | 'keycloak' | 'generic';
/** Endpoints with controllable failures. */
export type MockEndpoint =
  | 'discovery'
  | 'jwks'
  | 'authorize'
  | 'token'
  | 'graph-check'
  | 'graph-group';
/** Loopback provider configuration. */
export type MockOidcOptions = {
  port?: number;
  clientSecret?: string;
  shape?: ClaimShape;
  redirectUris?: string[];
  postLogoutRedirectUris?: string[];
  overageStyle?: 'hasgroups' | 'claim-sources';
};
/** A user authorization bound to the requesting client. */
export type Authorization = {
  username: string;
  clientId: string;
  scope: string;
  expiresAt: number;
};
/** A short-lived code bound to the original authorization request. */
export type AuthorizationCode = Authorization & {
  redirectUri: string;
  challenge: string;
  nonce: string;
};
/** One signing key and its published representation. */
export type SigningKey = Awaited<ReturnType<typeof createSigningKey>>;
/** Mutable state owned by a single running provider. */
export type ProviderState = {
  origin: string;
  issuer: string;
  graphUrl: string;
  apiAudience: string;
  options: Required<MockOidcOptions>;
  users: Record<string, TestUser>;
  codes: Map<string, AuthorizationCode>;
  refreshTokens: Map<string, Authorization>;
  accessTokens: Map<string, { username?: string; clientId: string }>;
  keys: SigningKey[];
  activeKey: number;
  lifetimes: { idToken: number; accessToken: number; refreshToken: number };
  clockOffset: number;
  failures: Map<MockEndpoint, 'error' | 'hang'>;
  pending: Map<MockEndpoint, Set<() => void>>;
  calls: { endpoint: string; params: Record<string, string> }[];
  stopped: boolean;
};

async function createSigningKey(kid: string) {
  const pair = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(pair.publicKey)), kid, alg: 'RS256', use: 'sig' };
  return { ...pair, kid, jwk };
}

/** Creates private copies of the directory and signing material. */
export async function createProviderState(options: MockOidcOptions): Promise<ProviderState> {
  return {
    origin: '',
    issuer: '',
    graphUrl: '',
    apiAudience: 'api://semantic-workbench',
    options: {
      port: options.port ?? 0,
      clientSecret: options.clientSecret ?? TEST_WORKBENCH_CLIENT.secret,
      shape: options.shape ?? 'entra',
      redirectUris: options.redirectUris ?? ['http://127.0.0.1:4310/auth/callback'],
      postLogoutRedirectUris: options.postLogoutRedirectUris ?? [
        'http://127.0.0.1:4310/auth/signed-out',
      ],
      overageStyle: options.overageStyle ?? 'claim-sources',
    },
    users: structuredClone(TEST_USERS),
    codes: new Map(),
    refreshTokens: new Map(),
    accessTokens: new Map(),
    keys: await Promise.all([createSigningKey('k1'), createSigningKey('k2')]),
    activeKey: 0,
    lifetimes: { idToken: 3600, accessToken: 3600, refreshToken: 86400 },
    clockOffset: 0,
    failures: new Map(),
    pending: new Map(),
    calls: [],
    stopped: false,
  };
}

/** Hashes a stable subject or PKCE verifier with SHA-256. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

/** Derives a repeatable UUID for a mock directory object. */
export function stableUuid(value: string): string {
  const hash = createHash('sha256').update(value).digest('hex');
  return (
    `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}` +
    `-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
  );
}

function entraClaims(state: ProviderState, user: TestUser, clientId: string): JWTPayload {
  const claims: JWTPayload = {
    sub: sha256(`${user.oid}:${clientId}`),
    oid: user.oid,
    tid: TEST_TENANT_ID,
    preferred_username: user.upn,
    upn: user.upn,
    email: user.email,
  };
  if (user.emailDomainVerified) claims.xms_edov = true;
  if (user.appRoles?.length) claims.roles = [...user.appRoles];
  if (!user.groupOverage) {
    claims.groups = user.groups.map(group => group.id);
  } else if (state.options.overageStyle === 'hasgroups') {
    claims.hasgroups = true;
  } else {
    claims._claim_names = { groups: 'src1' };
    claims._claim_sources = {
      src1: { endpoint: `${state.graphUrl}/v1.0/users/${user.oid}/getMemberObjects` },
    };
  }
  return claims;
}

function genericClaims(user: TestUser): JWTPayload {
  return {
    sub: user.username,
    preferred_username: user.username,
    email: user.email,
    email_verified: user.emailVerified,
    groups: user.groups.map(group => group.name),
  };
}

function keycloakClaims(user: TestUser): JWTPayload {
  return { ...genericClaims(user), sub: stableUuid(user.username) };
}

/** Builds current identity claims without token lifetime or audience fields. */
export function userClaims(state: ProviderState, username: string, clientId: string): JWTPayload {
  const user = state.users[username];
  let claims: JWTPayload;
  switch (state.options.shape) {
    case 'entra':
      claims = entraClaims(state, user, clientId);
      break;
    case 'keycloak':
      claims = keycloakClaims(user);
      break;
    case 'generic':
      claims = genericClaims(user);
      break;
  }
  return { ...claims, name: user.name };
}

/** Signs a token with the active key and the configured clock offset. */
export function signToken(
  state: ProviderState,
  claims: JWTPayload,
  audience: string,
  lifetime: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000) + state.clockOffset;
  const key = state.keys[state.activeKey];
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: key.kid })
    .setIssuer(state.issuer)
    .setAudience(audience)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + lifetime)
    .setJti(crypto.randomUUID())
    .sign(key.privateKey);
}

/** Accepts only a valid access token issued by this provider. */
export async function readAccessToken(state: ProviderState, token: string, audience?: string) {
  const identity = state.accessTokens.get(token);
  if (!identity) return undefined;
  try {
    const { payload } = await jwtVerify(
      token,
      header => {
        const key = state.keys.find(candidate => candidate.kid === header.kid);
        if (!key) throw new Error('Unknown signing key');
        return key.publicKey;
      },
      { issuer: state.issuer, audience, algorithms: ['RS256'] },
    );
    return { ...identity, payload };
  } catch {
    return undefined;
  }
}
