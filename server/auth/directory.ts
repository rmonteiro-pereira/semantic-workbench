// Resolves only configured directory groups using an application credential.
import type { AccessConfig } from './access-config';

/** Collects group identifiers mentioned by grants or restricted paths. */
export function directoryGroupIds(config: AccessConfig): string[] {
  const grants = config.grants.flatMap(grant =>
    grant.member.kind === 'group' ? [grant.member.groupId] : [],
  );
  const restricted = Object.values(config.projects.projects).flatMap(project =>
    project.restricted.flatMap(rule => rule.groups),
  );
  return [...new Set([...grants, ...restricted].map(id => id.toLowerCase()))];
}

/** Creates a bounded directory client with injectable token and HTTP edges. */
export function createDirectoryClient(options: {
  graphUrl: string;
  token: () => Promise<string>;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  failure?: (reason: string) => void;
}) {
  const request = options.fetch ?? fetch;
  async function call(path: string, groupIds?: string[]): Promise<unknown> {
    const token = await options.token();
    const response = await request(options.graphUrl + '/v1.0/' + path, {
      method: groupIds ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: groupIds ? JSON.stringify({ groupIds }) : undefined,
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Directory request failed.');
    return response.json();
  }
  return {
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
