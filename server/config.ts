// Reads the server's environment once at start-up. Local mode needs nothing; server mode needs a
// complete identity provider configuration, and any missing or unsafe value stops the start.
// Reading is pure except for one probe: SW_BRAND_DIR is checked with statSync so a folder that is
// named but missing is reported with the other problems instead of silently showing the default.
import { statSync } from 'node:fs';

type Env = Record<string, string | undefined>;

/** Claim mapping preset for the identity provider. */
export type ProviderKind = 'entra' | 'keycloak' | 'generic';

/** How the workbench proves its identity to the provider's token endpoint. */
export type ClientAuth =
  | { kind: 'secret'; secret: string }
  | { kind: 'managed-identity' }
  | { kind: 'private-key'; keyPath: string }
  | CertificateCredential;

/**
 * An Entra certificate credential: the PEM private key and the certificate's thumbprint in hex,
 * SHA-256 (64 characters, preferred) or SHA-1 (40 characters).
 */
export type CertificateCredential = { kind: 'certificate'; privateKey: string; thumbprint: string };

/** Settings shared by both modes. */
type CommonConfig = {
  host: string;
  port: number;
  dataDir: string;
  /** Folder for the rebuildable SQLite cache; null keeps it in the data root. */
  cacheDir: string | null;
  /** Folder that holds the operator's brand files; null serves the shipped defaults. */
  brandDir: string | null;
  serveStatic: boolean;
  inContainer: boolean;
  version: string | null;
  commit: string | null;
  /** Revision name given by Azure Container Apps, if any. */
  revision: string | null;
};

/** Configuration of the single-user mode on the loopback interface. */
export type LocalConfig = CommonConfig & { mode: 'local' };

/** Configuration of the team mode with OpenID Connect sign-in. */
export type ServerConfig = CommonConfig & {
  mode: 'server';
  /** External origin of the workbench, without a trailing slash. */
  publicUrl: string;
  oidc: {
    issuer: string;
    clientId: string;
    clientAuth: ClientAuth;
    scopes: string;
    provider: ProviderKind;
    /** Entra tenant whose tokens are accepted; null for other providers. */
    tenantId: string | null;
  };
  /** Where group membership comes from: the token's group claim, and the directory on overage. */
  directory: {
    groupClaim: string;
    overage: 'directory' | 'off';
    graphUrl: string;
  };
  /** Audiences an agent client's token may carry; empty refuses every bearer token. */
  apiAudience: string[];
  sessionKey: Uint8Array;
  bootstrapAdmins: { emails: string[]; ids: string[] };
  committer: { name: string; email: string };
  github: { host: string; clientId: string; clientSecret: string } | null;
  adoOnBehalfOf: boolean;
  /**
   * How many reverse proxies in front of the workbench append to X-Forwarded-For. Rate limits
   * take the client address from the entry that many places from the right; 0 trusts none.
   */
  trustedProxyHops: number;
};

/** The parsed configuration of either mode. */
export type Config = LocalConfig | ServerConfig;

/** One invalid or missing variable and what is wrong with it. */
export type ConfigProblem = { variable: string; message: string };

/** Refuses start-up, naming every variable at fault and never its value. */
export class ConfigError extends Error {
  constructor(readonly problems: ConfigProblem[]) {
    super(
      'The workbench cannot start:\n' +
        problems.map(problem => `- ${problem.variable}: ${problem.message}`).join('\n'),
    );
    this.name = 'ConfigError';
  }
}

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1', '[::1]'];

// The directory receives an app-only token, so only Microsoft's own Graph endpoints (public and
// national clouds) may receive it.
const GRAPH_ENDPOINTS = [
  'https://graph.microsoft.com',
  'https://graph.microsoft.us',
  'https://dod-graph.microsoft.us',
  'https://microsoftgraph.chinacloudapi.cn',
];

const DEFAULT_SCOPES = 'openid profile email offline_access';

/**
 * Microsoft's sign-in hosts of the public and national clouds. An Entra issuer must be one of
 * them, so the workbench's credential and people's refresh tokens go nowhere else.
 */
export const ENTRA_LOGIN_HOSTS = [
  'login.microsoftonline.com',
  'login.microsoftonline.us',
  'login.chinacloudapi.cn',
  'login.partner.microsoftonline.cn',
];

/** True when a host name or URL host is a loopback name. */
export function isLoopbackHost(host: string) {
  return LOOPBACK_HOSTS.includes(host.toLowerCase());
}

/** Reads and validates the environment; throws ConfigError listing every problem. */
export function readConfig(env: Env = process.env): Config {
  const problems: ConfigProblem[] = [];
  const mode = env.SW_MODE || 'local';
  if (mode !== 'local' && mode !== 'server') {
    problems.push({ variable: 'SW_MODE', message: 'must be "local" or "server".' });
  }
  const common = readCommon(env, mode === 'server', problems);
  if (mode !== 'server') {
    if (problems.length) throw new ConfigError(problems);
    return { ...common, mode: 'local' };
  }
  const server = readServer(env, common, problems);
  if (problems.length) throw new ConfigError(problems);
  return server;
}

function readCommon(env: Env, serverMode: boolean, problems: ConfigProblem[]): CommonConfig {
  const host = env.SW_HOST || '127.0.0.1';
  if (!serverMode && !isLoopbackHost(host)) {
    problems.push({
      variable: 'SW_HOST',
      message:
        'local mode listens on loopback only (127.0.0.1, localhost or ::1); ' +
        'a non-loopback address requires server mode with sign-in.',
    });
  }
  const portText = env.SW_PORT || '4310';
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || port < 1 || port > 65535) {
    problems.push({ variable: 'SW_PORT', message: 'must be a whole number from 1 to 65535.' });
  }
  return {
    host,
    port,
    dataDir: env.DATA_DIR || 'data',
    cacheDir: env.SW_CACHE_DIR || null,
    brandDir: readBrandDir(env.SW_BRAND_DIR, problems),
    // Server mode serves the frontend from the same origin as the API, always.
    serveStatic: serverMode || env.SW_SERVE_STATIC === '1',
    inContainer: env.SW_IN_CONTAINER === '1',
    version: env.SW_VERSION || null,
    commit: env.SW_COMMIT || null,
    revision: env.CONTAINER_APP_REVISION || null,
  };
}

// A brand folder that is named but missing would silently show the default brand, so it stops the
// start instead.
function readBrandDir(value: string | undefined, problems: ConfigProblem[]) {
  if (!value) return null;
  let isDirectory = false;
  try {
    isDirectory = statSync(value).isDirectory();
  } catch {
    isDirectory = false;
  }
  if (!isDirectory) {
    problems.push({ variable: 'SW_BRAND_DIR', message: 'must be an existing, readable folder.' });
  }
  return value;
}

function readServer(env: Env, common: CommonConfig, problems: ConfigProblem[]): ServerConfig {
  const required = (variable: string, message = 'is required in server mode.') => {
    const value = env[variable]?.trim();
    if (!value) problems.push({ variable, message });
    return value ?? '';
  };
  const publicUrl = readPublicUrl(required('SW_PUBLIC_URL'), problems);
  const loopbackPublicUrl = publicUrl !== null && isLoopbackHost(new URL(publicUrl).hostname);
  const provider = readProvider(env, problems);
  const issuer = readIssuer(required('SW_OIDC_ISSUER'), loopbackPublicUrl, problems);
  if (provider === 'entra') checkEntraIssuer(issuer, loopbackPublicUrl, problems);
  const clientId = required('SW_OIDC_CLIENT_ID');
  const clientAuth = readClientAuth(env, provider, problems);
  const tenantId = provider === 'entra' ? required('SW_ENTRA_TENANT_ID') : null;
  const sessionKey = readSessionKey(env.SW_SESSION_KEY?.trim() ?? '', problems);
  const bootstrapAdmins = readBootstrapAdmins(required('SW_BOOTSTRAP_ADMINS'), problems);
  const graphUrl = readGraphUrl(env.SW_GRAPH_URL, loopbackPublicUrl, problems);
  const groupOverage = env.SW_GROUP_OVERAGE || 'directory';
  if (groupOverage !== 'directory' && groupOverage !== 'off') {
    problems.push({ variable: 'SW_GROUP_OVERAGE', message: 'must be "directory" or "off".' });
  }
  return {
    ...common,
    mode: 'server',
    publicUrl: publicUrl ?? '',
    oidc: {
      issuer,
      clientId,
      clientAuth,
      scopes: env.SW_OIDC_SCOPES || defaultScopes(provider, clientId),
      provider,
      tenantId,
    },
    directory: {
      groupClaim: env.SW_GROUP_CLAIM || 'groups',
      overage: groupOverage === 'off' ? 'off' : 'directory',
      graphUrl,
    },
    apiAudience: readApiAudiences(env.SW_API_AUDIENCE),
    sessionKey,
    bootstrapAdmins,
    committer: {
      name: env.SW_COMMITTER_NAME || 'Semantic Workbench',
      email: env.SW_COMMITTER_EMAIL || 'workbench@localhost',
    },
    github: readGitHub(env, problems),
    // On-behalf-of is an Entra grant; other providers cannot issue Azure DevOps tokens.
    adoOnBehalfOf: provider === 'entra' && env.SW_ADO_OBO !== 'false',
    trustedProxyHops: readTrustedProxyHops(env.SW_TRUSTED_PROXY_HOPS, problems),
  };
}

// Entra issues the access token used for on-behalf-of only when the workbench asks for its own API.
function defaultScopes(provider: ProviderKind, clientId: string) {
  if (provider !== 'entra') return DEFAULT_SCOPES;
  return `${DEFAULT_SCOPES} api://${clientId}/access_as_user`;
}

function readPublicUrl(value: string, problems: ConfigProblem[]) {
  if (!value) return null;
  const url = parseUrl(value);
  const problem = (message: string) => {
    problems.push({ variable: 'SW_PUBLIC_URL', message });
    return null;
  };
  if (!url || !['https:', 'http:'].includes(url.protocol)) {
    return problem('must be an https:// URL.');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    return problem('must be an origin without a path, for example https://workbench.example.org.');
  }
  // Session cookies are Secure, so plain http works only on a developer's own machine.
  if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) {
    return problem('must use https:// unless it is a loopback address.');
  }
  return url.origin;
}

function readIssuer(value: string, loopbackPublicUrl: boolean, problems: ConfigProblem[]) {
  if (!value) return '';
  const url = parseUrl(value);
  if (!url || !['https:', 'http:'].includes(url.protocol)) {
    problems.push({ variable: 'SW_OIDC_ISSUER', message: 'must be an https:// URL.' });
    return '';
  }
  // A plain-http provider is only the mock provider or a local Keycloak on a developer's machine.
  if (url.protocol === 'http:' && !(loopbackPublicUrl && isLoopbackHost(url.hostname))) {
    problems.push({
      variable: 'SW_OIDC_ISSUER',
      message: 'must use https:// unless both it and SW_PUBLIC_URL are loopback addresses.',
    });
    return '';
  }
  return value.replace(/\/+$/, '');
}

// The mock provider on a developer's machine is the only other Entra issuer, and only when the
// workbench itself runs on loopback, the same rule as for a plain-http issuer.
function checkEntraIssuer(issuer: string, loopbackPublicUrl: boolean, problems: ConfigProblem[]) {
  if (!issuer) return;
  const url = new URL(issuer);
  const microsoftHost =
    url.protocol === 'https:' && ENTRA_LOGIN_HOSTS.includes(url.hostname) && !url.port;
  const developerMock = isLoopbackHost(url.hostname) && loopbackPublicUrl;
  if (microsoftHost || developerMock) return;
  problems.push({
    variable: 'SW_OIDC_ISSUER',
    message:
      'with SW_OIDC_PROVIDER=entra must be https://<login host>/<tenant>/v2.0 without a port, ' +
      `on ${ENTRA_LOGIN_HOSTS.join(', ')}.`,
  });
}

function readClientAuth(env: Env, provider: ProviderKind, problems: ConfigProblem[]): ClientAuth {
  const secret = env.SW_OIDC_CLIENT_SECRET?.trim();
  const assertion = env.SW_OIDC_CLIENT_ASSERTION?.trim();
  const certificate = readCertificate(env, provider, problems);
  if (secret && assertion) {
    problems.push({
      variable: 'SW_OIDC_CLIENT_SECRET or SW_OIDC_CLIENT_ASSERTION',
      message: 'set one of them, not both.',
    });
  }
  if (certificate && (secret || assertion)) {
    problems.push({
      variable: 'SW_OIDC_CLIENT_CERTIFICATE_KEY',
      message: 'set one credential: a certificate, a client secret or an assertion, not several.',
    });
  }
  if (!secret && !assertion && certificate === undefined) {
    problems.push({
      variable: 'SW_OIDC_CLIENT_SECRET or SW_OIDC_CLIENT_ASSERTION',
      message:
        'one of them, or SW_OIDC_CLIENT_CERTIFICATE_KEY with ' +
        'SW_OIDC_CLIENT_CERTIFICATE_THUMBPRINT (Entra only), is required in server mode.',
    });
  }
  if (certificate) return certificate;
  if (assertion === 'managed-identity') return { kind: 'managed-identity' };
  if (assertion) return readPrivateKeyPath(assertion, provider, problems);
  return { kind: 'secret', secret: secret ?? '' };
}

// Entra accepts a signed client assertion only when its header names the certificate, which a
// bare key file cannot do, so Entra takes the certificate pair instead.
function readPrivateKeyPath(
  keyPath: string,
  provider: ProviderKind,
  problems: ConfigProblem[],
): ClientAuth {
  if (provider === 'entra') {
    problems.push({
      variable: 'SW_OIDC_CLIENT_ASSERTION',
      message:
        'with Entra use "managed-identity", or a certificate through ' +
        'SW_OIDC_CLIENT_CERTIFICATE_KEY and SW_OIDC_CLIENT_CERTIFICATE_THUMBPRINT.',
    });
  }
  return { kind: 'private-key', keyPath };
}

/**
 * Reads the certificate pair. Returns undefined when neither variable is set and null when the
 * pair is present but unusable, so the caller does not report a missing credential twice.
 */
function readCertificate(
  env: Env,
  provider: ProviderKind,
  problems: ConfigProblem[],
): CertificateCredential | null | undefined {
  const privateKey = env.SW_OIDC_CLIENT_CERTIFICATE_KEY?.trim();
  const thumbprint = env.SW_OIDC_CLIENT_CERTIFICATE_THUMBPRINT?.replaceAll(':', '').trim();
  if (!privateKey && !thumbprint) return undefined;
  const problemCount = problems.length;
  if (!privateKey || !/-----BEGIN (RSA )?PRIVATE KEY-----/.test(privateKey)) {
    problems.push({
      variable: 'SW_OIDC_CLIENT_CERTIFICATE_KEY',
      message: 'must be the PEM private key of the certificate (-----BEGIN PRIVATE KEY-----).',
    });
  }
  if (!thumbprint || !/^([0-9a-f]{40}|[0-9a-f]{64})$/i.test(thumbprint)) {
    problems.push({
      variable: 'SW_OIDC_CLIENT_CERTIFICATE_THUMBPRINT',
      message: 'must be the certificate thumbprint in hex: SHA-256 (64 characters) or SHA-1 (40).',
    });
  }
  if (provider !== 'entra') {
    problems.push({
      variable: 'SW_OIDC_CLIENT_CERTIFICATE_KEY',
      message: 'certificate credentials are supported with SW_OIDC_PROVIDER=entra only.',
    });
  }
  if (problems.length > problemCount) return null;
  return { kind: 'certificate', privateKey: privateKey!, thumbprint: thumbprint!.toLowerCase() };
}

function readProvider(env: Env, problems: ConfigProblem[]): ProviderKind {
  const provider = env.SW_OIDC_PROVIDER || 'generic';
  if (provider === 'entra' || provider === 'keycloak' || provider === 'generic') return provider;
  problems.push({
    variable: 'SW_OIDC_PROVIDER',
    message: 'must be "entra", "keycloak" or "generic".',
  });
  return 'generic';
}

function readSessionKey(value: string, problems: ConfigProblem[]) {
  const key = /^[A-Za-z0-9+/]+={0,2}$/.test(value) ? Buffer.from(value, 'base64') : null;
  if (!key || key.byteLength !== 32 || key.every(byte => byte === key[0])) {
    problems.push({
      variable: 'SW_SESSION_KEY',
      message: 'must be 32 random bytes encoded as base64 (for example `openssl rand -base64 32`).',
    });
    return new Uint8Array(0);
  }
  return new Uint8Array(key);
}

/** Reads the comma-separated audiences of agent tokens, such as the API app's client id. */
function readApiAudiences(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
}

function readBootstrapAdmins(value: string, problems: ConfigProblem[]) {
  const entries = value
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
  if (value && !entries.length) {
    problems.push({
      variable: 'SW_BOOTSTRAP_ADMINS',
      message: 'must name at least one e-mail address or stable id.',
    });
  }
  // Addresses match the verified address case-insensitively; stable ids match exactly.
  return {
    emails: entries.filter(entry => entry.includes('@')).map(entry => entry.toLowerCase()),
    ids: entries.filter(entry => !entry.includes('@')),
  };
}

const MAX_TRUSTED_PROXY_HOPS = 5;

function readTrustedProxyHops(value: string | undefined, problems: ConfigProblem[]): number {
  const text = value?.trim() ?? '';
  if (text === '') return 0;
  const hops = Number(text);
  if (!/^\d+$/.test(text) || hops > MAX_TRUSTED_PROXY_HOPS) {
    problems.push({
      variable: 'SW_TRUSTED_PROXY_HOPS',
      message: `must be a whole number from 0 to ${MAX_TRUSTED_PROXY_HOPS}.`,
    });
    return 0;
  }
  return hops;
}

function readGraphUrl(
  value: string | undefined,
  loopbackPublicUrl: boolean,
  problems: ConfigProblem[],
) {
  const graphUrl = (value || GRAPH_ENDPOINTS[0]).replace(/\/+$/, '');
  if (GRAPH_ENDPOINTS.includes(graphUrl)) return graphUrl;
  // The mock provider's Graph stand-in, only on a developer's machine.
  const url = parseUrl(graphUrl);
  if (url?.protocol === 'http:' && isLoopbackHost(url.hostname) && loopbackPublicUrl) {
    return graphUrl;
  }
  problems.push({
    variable: 'SW_GRAPH_URL',
    message: `must be one of ${GRAPH_ENDPOINTS.join(', ')}.`,
  });
  return GRAPH_ENDPOINTS[0];
}

function readGitHub(env: Env, problems: ConfigProblem[]) {
  const clientId = env.SW_GITHUB_CLIENT_ID?.trim();
  const clientSecret = env.SW_GITHUB_CLIENT_SECRET?.trim();
  if (!clientId && !clientSecret) return null;
  if (!clientId || !clientSecret) {
    problems.push({
      variable: clientId ? 'SW_GITHUB_CLIENT_SECRET' : 'SW_GITHUB_CLIENT_ID',
      message: 'GitHub sign-in needs both SW_GITHUB_CLIENT_ID and SW_GITHUB_CLIENT_SECRET.',
    });
    return null;
  }
  const host = (env.SW_GITHUB_HOST || 'github.com').trim().toLowerCase();
  // Tokens are requested from this host, so it must be a bare host name, never a URL.
  if (!/^[a-z0-9.-]+(:\d+)?$/.test(host)) {
    problems.push({
      variable: 'SW_GITHUB_HOST',
      message: 'must be a host name such as github.com or github.example.org.',
    });
    return null;
  }
  return { host, clientId, clientSecret };
}

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
