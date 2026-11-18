import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { privateWindowsAcl } from './mcp-credential-permissions';

type CredentialBinding = { server: string; clientId: string };
type Tokens = { accessToken: string; refreshToken: string; accessExpiresAt: number };

// Refresh early enough to avoid expiring while sending a request.
const REFRESH_MARGIN_MS = 30_000;
// Bound discovery and token requests independently of the protocol call deadline.
const EXCHANGE_TIMEOUT_MS = 15_000;
const RECONNECT = 'Connection ended. Create a new setup credential and restart the bridge.';

/** Opens an owner-only file or directory, refusing links and permissions that expose credentials. */
function privatePath(path: string, directory: boolean): boolean {
  try {
    const info = lstatSync(path);
    const expected = directory ? info.isDirectory() : info.isFile();
    const ownerOnly = process.platform === 'win32' ? privateWindowsAcl(path, false) : (info.mode & 0o077) === 0 && info.uid === process.getuid?.();
    if (!expected || !ownerOnly || (!directory && info.nlink !== 1)) {
      throw new Error('The bridge credential path must be owned by you and accessible only to you.');
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Returns the private credential file for one configured server. */
export function bridgeCredentialPath(server: string): string {
  const config = process.env.XDG_CONFIG_HOME || (process.platform === 'win32' ? process.env.LOCALAPPDATA : undefined) || join(homedir(), '.config');
  const hash = createHash('sha256').update(server).digest('hex');
  return join(config, 'semantic-workbench', 'connections', hash + '.json');
}

function tokensOf(value: unknown): Tokens | undefined {
  if (!value || typeof value !== 'object') return;
  const fields = value as Partial<Tokens>;
  if (typeof fields.accessToken !== 'string' || !fields.accessToken || typeof fields.refreshToken !== 'string' || !fields.refreshToken) return;
  if (typeof fields.accessExpiresAt !== 'number' || !Number.isFinite(fields.accessExpiresAt)) return;
  return { accessToken: fields.accessToken, refreshToken: fields.refreshToken, accessExpiresAt: fields.accessExpiresAt };
}

function writeTokens(path: string, tokens: Tokens & CredentialBinding): void {
  if (!privatePath(dirname(path), true)) throw new Error('The private bridge credential directory is missing.');
  privatePath(path, false);
  const temporary = path + '.' + randomUUID();
  try {
    writeFileSync(temporary, JSON.stringify(tokens), { mode: 0o600, flag: 'wx' });
    privatePath(temporary, false);
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function publicOrigin(address: string): string {
  const url = new URL(address);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.origin === 'null' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use a server origin as SW_SERVER_URL.');
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) throw new Error('SW_SERVER_URL must use HTTPS or loopback HTTP.');
  return url.origin;
}

/** Holds one bridge connection and serializes rotating exchanges within the process. */
export function openServerCredentials(address: string, clientId: string, setupCredential?: string, send: typeof fetch = fetch) {
  const server = publicOrigin(address);
  const resource = server + '/api/mcp';
  const path = bridgeCredentialPath(server);
  const directory = dirname(path);
  mkdirSync(dirname(directory), { recursive: true, mode: 0o700 });
  try {
    mkdirSync(directory, { mode: 0o700 });
    if (process.platform === 'win32' && !privateWindowsAcl(directory, true)) throw new Error('Could not set private bridge permissions.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  privatePath(directory, true);
  function readTokens(): Tokens | undefined {
    if (!privatePath(path, false)) return;
    const value = JSON.parse(readFileSync(path, 'utf8'));
    const tokens = tokensOf(value);
    if (!tokens || value.server !== server || value.clientId !== clientId) throw new Error('The cached credentials belong to a different agent program or are invalid.');
    return tokens;
  }
  let current = readTokens();
  let setup = setupCredential;
  let pending: Promise<string> | undefined;
  let tokenEndpoint: string | undefined;
  let ended = false;

  async function discover(): Promise<string> {
    if (tokenEndpoint) return tokenEndpoint;
    const response = await send(server + '/.well-known/oauth-authorization-server', { redirect: 'error', signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS) });
    if (response.status !== 200) throw new Error('Server authorization metadata could not be read.');
    const metadata = await response.json();
    if (metadata.issuer !== server || metadata.token_endpoint !== server + '/oauth/token') throw new Error('Server authorization metadata is invalid.');
    tokenEndpoint = metadata.token_endpoint as string;
    return tokenEndpoint;
  }

  async function exchange(): Promise<string> {
    if (ended || (!current && !setup)) throw new Error(RECONNECT);
    const body = new URLSearchParams({ client_id: clientId, resource });
    if (current) {
      body.set('grant_type', 'refresh_token');
      body.set('refresh_token', current.refreshToken);
    } else {
      body.set('grant_type', 'urn:semantic-workbench:grant-type:setup');
      body.set('setup_credential', setup!);
    }
    const response = await send(await discover(), { method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS) });
    const reply = await response.json();
    if (response.status === 400 && reply.error === 'invalid_grant') {
      ended = true;
      current = undefined;
      setup = undefined;
      rmSync(path, { force: true });
      throw new Error(RECONNECT);
    }
    if (response.status !== 200 || reply.token_type !== 'Bearer' || !Number.isFinite(reply.expires_in) || reply.expires_in <= 0) throw new Error('Server token exchange failed.');
    const tokens = tokensOf({ accessToken: reply.access_token, refreshToken: reply.refresh_token, accessExpiresAt: Date.now() + reply.expires_in * 1000 });
    if (!tokens) throw new Error('The server returned invalid connection tokens.');
    setup = undefined;
    try {
      writeTokens(path, { ...tokens, server, clientId });
    } catch (error) {
      // After rotation the old file cannot recover this connection safely.
      ended = true;
      current = undefined;
      throw error;
    }
    current = tokens;
    return tokens.accessToken;
  }

  async function renew(rejected?: string): Promise<string> {
    // A second bridge must never submit a refresh token another process is rotating.
    const lock = path + '.lock';
    try {
      mkdirSync(lock, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      throw new Error('Another bridge is updating the connection. Retry shortly.');
    }
    try {
      current = readTokens();
      if (current && current.accessToken !== rejected && current.accessExpiresAt - Date.now() > REFRESH_MARGIN_MS) return current.accessToken;
      return await exchange();
    } finally {
      rmdirSync(lock);
    }
  }

  return {
    resource,
    /** Returns a live token, refreshing once for any group of simultaneous requests. */
    access(rejected?: string): Promise<string> {
      if (!privatePath(directory, true)) return Promise.reject(new Error('The private bridge credential directory is missing.'));
      if (pending) return pending;
      if (current && privatePath(path, false) && current.accessToken !== rejected && current.accessExpiresAt - Date.now() > REFRESH_MARGIN_MS) return Promise.resolve(current.accessToken);
      pending = renew(rejected).finally(() => {
        pending = undefined;
      });
      return pending;
    },
  };
}

/** Deletes cached credentials after the person signs out or revokes the connection in the browser. */
export function forgetServerCredentials(address: string): void {
  const path = bridgeCredentialPath(publicOrigin(address));
  if (privatePath(dirname(path), true) && privatePath(path, false)) rmSync(path);
}

/** Reads a setup credential only from an owner-only regular file. */
export function readSetupCredential(path: string): string {
  if (!privatePath(path, false)) throw new Error('The setup credential file is missing.');
  return readFileSync(path, 'utf8').trim();
}
