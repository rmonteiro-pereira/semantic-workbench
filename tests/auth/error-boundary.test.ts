// What a client may learn from a failure: typed input errors keep their message and 400, and any
// other error becomes a plain 500 whose cause only the server log holds.
import { expect, spyOn, test } from 'bun:test';
import { join } from 'node:path';
import { createAuditLog } from '../../src/server/auth/audit';
import { createAccessControl } from '../../src/server/auth/authorize';
import { localPrincipal } from '../../src/server/auth/principal';
import { accessFixture } from './access-fixture';
import { createHandler } from '../../src/server/handler';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { testWorkspace } from '../helpers/temp-data-dir';

const secret = '/srv/workbench/data/state/secret-file.json: EACCES';

async function serverApp() {
  const workspace = await testWorkspace();
  const audit = createAuditLog({ dir: join(workspace.root, 'audit') });
  const options = {
    mode: 'server' as const,
    remoteCredentials: allowEveryRemote(),
    audit,
    publicOrigin: 'http://localhost',
    principal: localPrincipal,
    access: createAccessControl({ ...accessFixture(), mode: 'local' }),
  };
  return { workspace, options, [Symbol.dispose]: () => workspace.dispose() };
}

function failWith(app: Awaited<ReturnType<typeof serverApp>>, error: unknown) {
  return spyOn(app.workspace.ws, 'documentsFor').mockImplementation(() => {
    throw error;
  });
}

const documents = () => new Request('http://localhost/api/documents');

test('server mode answers an unexpected error with a plain 500 and logs the cause', async () => {
  using app = await serverApp();
  failWith(app, new Error(secret));
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try {
    const handler = createHandler(app.workspace.ws, app.options);
    const response = await handler(documents());
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"error":"Internal error."}');
    const requestId = response.headers.get('X-Request-Id')!;
    const written = log.mock.calls.flat().join('\n');
    expect(written).toContain(`http.unexpected-error requestId=${requestId}`);
    expect(written).toContain('EACCES');
    expect(written).not.toContain('/srv/workbench');
  } finally {
    log.mockRestore();
  }
});

test('a route that is not part of the legacy interface answers the same way', async () => {
  using app = await serverApp();
  const log = spyOn(console, 'error').mockImplementation(() => {});
  const handler = createHandler(app.workspace.ws, app.options);
  const failure = spyOn(app.workspace.ws.state, 'registry').mockImplementation(() => {
    throw new TypeError(secret);
  });
  try {
    const response = await handler(new Request('http://localhost/api/projects'));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('EACCES');
    expect(log.mock.calls.flat().join('\n')).toContain('errorName=TypeError');
    expect(log.mock.calls.flat().join('\n')).not.toContain('/srv/workbench');
  } finally {
    failure.mockRestore();
    log.mockRestore();
  }
});

test('a failure while resolving the caller is also a plain 500', async () => {
  using app = await serverApp();
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try {
    const handler = createHandler(app.workspace.ws, {
      ...app.options,
      principal: () => {
        throw new Error(secret);
      },
    });
    const response = await handler(new Request('http://localhost/api/projects'));
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"error":"Internal error."}');
    expect(log.mock.calls.flat().join('\n')).toContain('EACCES');
    expect(log.mock.calls.flat().join('\n')).not.toContain('/srv/workbench');
  } finally {
    log.mockRestore();
  }
});

test("a malformed request body is still the caller's 400 with its message", async () => {
  using app = await serverApp();
  const handler = createHandler(app.workspace.ws, app.options);
  const response = await handler(
    new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-SW-Request': '1',
        Origin: 'http://localhost',
      },
      body: '{not json',
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Malformed JSON request.' });
});

test('local mode keeps the message of an unexpected error in a 400', async () => {
  using app = await serverApp();
  failWith(app, new Error('plain failure'));
  const handler = createHandler(app.workspace.ws, { audit: app.options.audit });
  const response = await handler(documents());
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'plain failure' });
});

test("the legacy document interface keeps 400 for the caller's own mistakes", async () => {
  using app = await serverApp();
  const handler = createHandler(app.workspace.ws, app.options);
  const response = await handler(
    new Request('http://localhost/api/documents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-SW-Request': '1',
        Origin: 'http://localhost',
      },
      body: '{"filename": 3}',
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Expected filename and source strings.' });
});
