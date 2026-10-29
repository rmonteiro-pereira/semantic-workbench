// Resolves only configured directory groups using an application credential.
import type { AccessConfig } from './access-config';
import { isLoopbackHost } from '../config';

/** Public directory lookup result, including a recoverable unresolved name. */
export type GroupName = { id: string; displayName: string | null; resolved: boolean };
/** Looks up one group's display name; it never fails, it reports the name as unresolved. */
export type GroupLookup = (id: string) => Promise<GroupName>;

/** The answer when no directory is configured or the lookup failed. */
export async function unresolvedGroupName(id: string): Promise<GroupName> {
  return { id, displayName: null, resolved: false };
}

/** Settings of the group-name cache; the clock is injectable for tests. */
export type GroupNameCacheOptions = { ttlMs?: number; concurrency?: number; now?: () => number };

/**
 * Remembers group names for a short time and looks up at most `concurrency` names at once, so
 * opening the users panel or saving grants does not send one directory request per grant.
 */
export function createGroupNameCache(lookup: GroupLookup, options: GroupNameCacheOptions = {}) {
  const ttlMs = options.ttlMs ?? 60_000;
  const concurrency = options.concurrency ?? 4;
  const now = options.now ?? Date.now;
  const cached = new Map<string, { expires: number; name: Promise<GroupName> }>();
  function forget(time: number) {
    for (const [id, entry] of cached) if (entry.expires <= time) cached.delete(id);
  }
  function name(id: string): Promise<GroupName> {
    const time = now();
    const hit = cached.get(id);
    if (hit && hit.expires > time) return hit.name;
    forget(time);
    const pending = lookup(id).catch(() => unresolvedGroupName(id));
    cached.set(id, { expires: time + ttlMs, name: pending });
    return pending;
  }
  /** Names of every distinct id, with at most `concurrency` lookups in flight. */
  async function names(ids: string[]): Promise<Map<string, GroupName>> {
    const queue = [...new Set(ids)];
    const result = new Map<string, GroupName>();
    async function worker() {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        result.set(id, await name(id));
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
    return result;
  }
  return { name, names };
}

/** Collects group identifiers mentioned by grants or restricted paths. */
export function directoryGroupIds(config: AccessConfig): string[] {
  const grants = config.grants.flatMap(grant => (grant.member.kind === 'group' ? [grant.member.groupId] : []));
  const restricted = Object.values(config.projects.projects).flatMap(project => project.restricted.flatMap(rule => rule.groups));
  return [...new Set([...grants, ...restricted].map(id => id.toLowerCase()))];
}

/**
 * The scope of the application token for directory lookups. The mock provider's Graph stand-in
 * on loopback is addressed with Microsoft Graph's own scope, as the real Graph would be.
 */
export function directoryScope(graphUrl: string): string {
  if (isLoopbackHost(new URL(graphUrl).hostname)) return 'https://graph.microsoft.com/.default';
  return graphUrl + '/.default';
}

/** Creates a bounded directory client with injectable token and HTTP edges. */
export function createDirectoryClient(options: {
  graphUrl: string;
  token: () => Promise<string>;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  failure?: (reason: string) => void;
  timeoutMs?: number;
}) {
  const request = options.fetch ?? fetch;
  async function perform(path: string, signal: AbortSignal, groupIds?: string[]): Promise<unknown> {
    const token = await options.token();
    signal.throwIfAborted();
    const response = await request(options.graphUrl + '/v1.0/' + path, {
      method: groupIds ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: groupIds ? JSON.stringify({ groupIds }) : undefined,
      signal,
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Directory request failed.');
    return response.json();
  }
  async function call(path: string, groupIds?: string[]): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('Directory lookup timed out.'));
      }, options.timeoutMs ?? 5000);
    });
    try {
      return await Promise.race([perform(path, controller.signal, groupIds), timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }
  return {
    async group(id: string) {
      try {
        if (!id || id.length > 256) throw new Error('Invalid directory group ID.');
        const body = await call('groups/' + encodeURIComponent(id) + '?$select=displayName');
        const displayName = (body as { displayName?: unknown })?.displayName;
        if (typeof displayName !== 'string') throw new Error('Invalid directory group name.');
        return { id, displayName, resolved: true };
      } catch {
        options.failure?.('directory-unavailable');
        return { id, displayName: null, resolved: false };
      }
    },
    async groups(oid: string, ids: string[]): Promise<string[] | null> {
      try {
        const result = new Set<string>();
        for (let offset = 0; offset < ids.length; offset += 20) {
          const batch = ids.slice(offset, offset + 20);
          const body = await call('users/' + encodeURIComponent(oid) + '/checkMemberGroups', batch);
          const value = (body as { value?: unknown })?.value;
          if (!Array.isArray(value) || !value.every(id => typeof id === 'string')) {
            throw new Error('Invalid directory membership response.');
          }
          for (const id of value) if (batch.includes(id)) result.add(id);
        }
        return [...result];
      } catch {
        options.failure?.('directory-unavailable');
        return null;
      }
    },
  };
}
