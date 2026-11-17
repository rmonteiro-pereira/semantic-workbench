// Server mode does not mount the endpoint: the path is an unknown route, no tool exists and no other route changes.
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createAuditLog } from '../../src/server/auth/audit';
import { createAccessControl } from '../../src/server/auth/authorize';
import { routeFor } from '../../src/server/auth/route-actions';
import { createHandler } from '../../src/server/handler';
import { openLocalCapability } from '../../src/server/mcp/local-capability';
import { authWorkspace } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { accessFixture, person } from '../auth/access-fixture';

test('server mode answers the path as an unknown route and leaves other routes unchanged', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const opened = openLocalCapability(join(fixture.root, 'state', 'mcp-capability'));
  if (!opened.ok) throw new Error(opened.reason);
  const build = (withEndpoint: boolean) =>
    createHandler(fixture.ws, {
      mode: 'server',
      access,
      audit: createAuditLog({ dir: join(fixture.root, withEndpoint ? 'with-audit' : 'without-audit') }),
      principal: () => principal,
      publicOrigin: 'http://localhost:5312',
      remoteCredentials: allowEveryRemote(),
      ...(withEndpoint ? { mcp: { capability: opened.capability } } : {}),
    });
  const withEndpoint = build(true);
  const without = build(false);
  const send = (handler: ReturnType<typeof build>, path: string, init: RequestInit = {}) => handler(new Request('http://localhost:5312' + path, { headers: { 'Sec-Fetch-Site': 'same-origin', Origin: 'http://localhost:5312' }, ...init }));
  // A read of the path is an unknown route; a post is stopped earlier by the cross-site check. Neither serves a tool.
  const probe = await send(withEndpoint, '/api/mcp');
  expect(probe.status).toBe(404);
  const mcp = await send(withEndpoint, '/api/mcp', { method: 'POST', body: '{}' });
  expect(mcp.status).toBeGreaterThanOrEqual(400);
  expect(await mcp.text()).not.toContain('tools');
  expect(routeFor('POST', '/api/mcp', 'server')).toBeNull();
  expect(routeFor('POST', '/api/mcp', 'local')?.row.localOnly).toBe(true);
  for (const path of ['/api/projects', '/api/trash', '/api/status']) {
    const first = await send(withEndpoint, path);
    const second = await send(without, path);
    expect(first.status, path).toBe(second.status);
    expect(await first.text(), path).toBe(await second.text());
  }
});
