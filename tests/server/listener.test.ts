// The production listener's edge: no debug page, one answer for failures, and no idle timeout
// except for the event stream.
import { expect, spyOn, test } from 'bun:test';
import { createHandler } from '../../src/server/handler';
import { serveOptions } from '../../src/server/serve-options';
import { testWorkspace } from '../helpers/temp-data-dir';

const settings = { hostname: '127.0.0.1', port: 4310, fetch: () => new Response('ok') };

test('the listener runs outside development mode with a bounded idle timeout', () => {
  const options = serveOptions(settings);
  expect(options.development).toBe(false);
  expect(options.idleTimeout).toBeGreaterThan(0);
  expect(options.hostname).toBe('127.0.0.1');
  expect(options.port).toBe(4310);
});

test('an error that reaches the listener answers a plain 500 and is logged', async () => {
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try {
    const response = serveOptions(settings).error(new Error('/srv/data/secret.json'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal error.' });
    const written = log.mock.calls.flat().join('\n');
    expect(written).toContain('http.listener-error');
    expect(written).not.toContain('/srv/data/secret.json');
  } finally {
    log.mockRestore();
  }
});

test('only the event stream asks the server to keep its connection open', async () => {
  using workspace = await testWorkspace();
  const kept: string[] = [];
  const handler = createHandler(workspace.ws, {
    keepOpen: request => kept.push(new URL(request.url).pathname),
  });
  const projects = await handler(new Request('http://localhost/api/projects'));
  expect(projects.status).toBe(200);
  expect(kept).toEqual([]);
  const events = await handler(new Request('http://localhost/api/events'));
  expect(kept).toEqual(['/api/events']);
  await events.body?.cancel();
});
