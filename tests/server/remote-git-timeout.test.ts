// Remote Git commands can be silent for longer than the idle timeout, so their connections are
// kept open; local ones are not.
import { expect, test } from 'bun:test';
import { createGitRoutes } from '../../src/server/routes/git';

async function keptOpenFor(action: string) {
  const kept: string[] = [];
  const route = createGitRoutes({ keepOpen: request => kept.push(request.url) });
  const request = new Request(`http://localhost/api/projects/sales/git/${action}`, {
    method: 'POST',
  });
  // The route needs an access scope that this test does not attach; it fails after the hook.
  await Promise.resolve(route({} as never, request, new URL(request.url))).catch(() => undefined);
  return kept.length === 1;
}

test('fetch, pull, push, sync and the default-branch commands keep the connection open', async () => {
  for (const action of ['fetch', 'pull', 'push', 'sync', 'pull-default', 'push-default']) {
    expect(await keptOpenFor(action)).toBe(true);
  }
});

test('local Git commands leave the idle timeout alone', async () => {
  for (const action of ['commit', 'stage', 'checkout']) {
    expect(await keptOpenFor(action)).toBe(false);
  }
});
