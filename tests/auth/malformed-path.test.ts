// A malformed escape in a URL is the caller's mistake: 400, not an internal error.
import { expect, test } from 'bun:test';
import { createAuditLog } from '../../server/auth/audit';
import { createAccessControl } from '../../server/auth/authorize';
import { localPrincipal } from '../../server/auth/principal';
import { routeFor } from '../../server/auth/route-actions';
import { createHandler } from '../../server/handler';
import { decodeSegment } from '../../server/request';
import { PathError } from '../../server/projects/paths';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { testWorkspace } from '../helpers/temp-data-dir';
import { accessFixture } from './access-fixture';
import { join } from 'node:path';

test('decodeSegment decodes escapes and refuses malformed ones as a path error', () => {
  expect(decodeSegment('a%20b')).toBe('a b');
  expect(() => decodeSegment('%E0%A4%A')).toThrow(PathError);
});

test('the route inventory refuses a malformed project name as a path error', () => {
  const found = routeFor('GET', '/api/projects/%E0%A4%A/files/x.yaml', 'server')!;
  const url = new URL('http://localhost/api/projects/%E0%A4%A/files/x.yaml');
  expect(() => found.row.resource(found.match, url)).toThrow(PathError);
});

const paths = [
  '/api/projects/%E0%A4%A/files/x',
  '/api/projects/%E0%A4%A/git/status',
  '/api/projects/%E0%A4%A/metrics',
  '/api/projects/%E0%A4%A/delete-impact',
];

test('server mode answers 400 for a malformed escape in a path', async () => {
  const workspace = await testWorkspace();
  using _cleanup = { [Symbol.dispose]: () => workspace.dispose() };
  const handler = createHandler(workspace.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    audit: createAuditLog({ dir: join(workspace.root, 'audit') }),
    principal: localPrincipal,
    access: createAccessControl({ ...accessFixture(), mode: 'local' }),
    publicOrigin: 'http://localhost',
  });
  for (const path of paths) {
    const response = await handler(new Request('http://localhost' + path));
    expect([path, response.status]).toEqual([path, 400]);
  }
  const saved = await handler(
    new Request('http://localhost/api/projects/%E0%A4%A/save-batch', {
      method: 'POST',
      headers: { Origin: 'http://localhost', 'X-SW-Request': '1' },
      body: '{}',
    }),
  );
  expect(saved.status).toBe(400);
});
