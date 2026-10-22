// Checks overage batching and fail-closed resolution using an injected HTTP edge.
import { expect, test } from 'bun:test';
import { createDirectoryClient } from '../../server/auth/directory';

test('checks at most twenty candidate groups per call and drops unexpected groups', async () => {
  const batches: string[][] = [];
  const directory = createDirectoryClient({
    graphUrl: 'http://127.0.0.1/graph',
    token: async () => 'app-token',
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      batches.push(body.groupIds);
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer app-token');
      return Response.json({ value: [...body.groupIds, 'unrequested'] });
    },
  });
  const ids = Array.from({ length: 45 }, (_, index) => String(index));
  expect(await directory.groups('person', ids)).toEqual(ids);
  expect(batches.map(batch => batch.length)).toEqual([20, 20, 5]);
});

test('a directory failure removes all membership and reports a safe reason', async () => {
  const failures: string[] = [];
  const directory = createDirectoryClient({
    graphUrl: 'http://127.0.0.1/graph',
    token: async () => 'secret',
    fetch: async () => new Response('secret provider error', { status: 503 }),
    failure: reason => failures.push(reason),
  });
  expect(await directory.groups('person', ['group'])).toBeNull();
  expect(failures).toEqual(['directory-unavailable']);
});
