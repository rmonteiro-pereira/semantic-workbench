// Decides which remote addresses server mode may reach and which kind of delegated credential a
// host takes. Pure functions: the allowed hosts come from the administration settings.
import { isLoopbackHost } from '../config';
import type { RemoteAddresses } from '../projects/git';

/** Hosts of Azure DevOps Services; a leading `*.` matches any subdomain. */
export const AZURE_DEVOPS_HOSTS = ['dev.azure.com', '*.visualstudio.com'];

/** A remote address server mode may not reach; carries the hosts an Admin allowed. */
export class RemoteHostError extends Error {
  constructor(
    readonly allowedHosts: string[],
    reason: string,
  ) {
    const list = allowedHosts.length ? allowedHosts.join(', ') : 'none';
    super(`${reason} Allowed hosts: ${list}.`);
    this.name = 'RemoteHostError';
  }
}

/** An allowed address: its host in lower case and the address as Git should store it. */
export type AllowedAddress = { host: string; address: string };

// Git and curl split some addresses differently from the URL parser used here: a backslash, or
// an `@` after the host, could make them reach another host than the one checked.
function ambiguous(address: string) {
  if (address.includes('\\')) return true;
  const afterScheme = address.slice(address.indexOf('//') + 2);
  const authorityEnd = afterScheme.search(/[/?#]/);
  const authority = authorityEnd < 0 ? afterScheme : afterScheme.slice(0, authorityEnd);
  const rest = authorityEnd < 0 ? '' : afterScheme.slice(authorityEnd);
  return rest.includes('@') || authority.split('@').length > 2;
}

// The host exactly as the address writes it, which is how Git names it in its prompts.
function writtenHost(address: string) {
  const afterScheme = address.trim().slice(address.trim().indexOf('//') + 2);
  const authority = afterScheme.split(/[/?#]/)[0];
  return authority.slice(authority.lastIndexOf('@') + 1);
}

function httpRemote(address: string) {
  const trimmed = address.trim();
  if (!/^https?:\/\//i.test(trimmed) || ambiguous(trimmed)) return null;
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

/**
 * Checks an address server mode may reach and returns its host and canonical form, or refuses
 * it. Only HTTPS remotes are reached, because only they can receive a delegated token; plain
 * HTTP is accepted for a loopback host on the server itself. SSH, local paths, addresses Git
 * could read differently, and hosts not on the list are refused.
 */
export function allowedRemoteHost(address: unknown, allowedHosts: string[]): AllowedAddress {
  const url = typeof address === 'string' ? httpRemote(address) : null;
  const secure = url?.protocol === 'https:' || (url !== null && isLoopbackHost(url.hostname));
  if (!url || !secure) {
    throw new RemoteHostError(
      allowedHosts,
      'Server mode reaches remotes over HTTPS only, at a plain host address.',
    );
  }
  // A password in the address would be stored in plain text in the repository's configuration.
  if (url.password) throw new Error('A remote address may not contain a password.');
  const host = url.host.toLowerCase();
  // Host names are compared in lower case, as URLs give them.
  if (!allowedHosts.some(allowed => allowed.toLowerCase() === host)) {
    throw new RemoteHostError(allowedHosts, `${host} is not on the allowed host list.`);
  }
  return { host, address: url.href };
}

/**
 * Checks both addresses of a remote and returns their one host. A command gets one credential,
 * so fetching and pushing through different hosts would offer it to the wrong one.
 */
export function allowedRemoteAddresses(remote: RemoteAddresses, allowedHosts: string[]) {
  const fetchHost = storedHost(remote.fetchUrl, allowedHosts);
  const pushHost = storedHost(remote.pushUrl, allowedHosts);
  if (pushHost !== fetchHost) {
    throw new Error('A remote must fetch and push through the same host in server mode.');
  }
  return fetchHost;
}

/**
 * The host of a stored address, which must be written in canonical form: the askpass program
 * matches Git's prompt, which repeats the host as written, against the canonical host.
 */
function storedHost(address: string, allowedHosts: string[]) {
  const { host } = allowedRemoteHost(address, allowedHosts);
  if (writtenHost(address) !== host) {
    throw new RemoteHostError(
      allowedHosts,
      `The remote address names ${host} in another form; save it again under Remote.`,
    );
  }
  return host;
}

function hostMatches(host: string, pattern: string) {
  if (pattern.startsWith('*.')) return host.endsWith(pattern.slice(1));
  return host === pattern;
}

/** Which kind of delegated credential a remote host takes. */
export function credentialKind(
  host: string,
  hosts: { github: string | null; azureDevOps: string[] },
): 'github' | 'azure-devops' | 'none' {
  if (hosts.azureDevOps.some(pattern => hostMatches(host, pattern))) return 'azure-devops';
  if (hosts.github !== null && host === hosts.github.toLowerCase()) return 'github';
  return 'none';
}
