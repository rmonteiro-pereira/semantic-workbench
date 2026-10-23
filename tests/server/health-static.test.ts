// Tests public startup responses and static files without opening a socket.
import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { healthResponse } from '../../server/routes/health';
import { securityHeaders, serveStatic } from '../../server/static';
import { probeDataRoot } from '../../server/projects/data-root';

for (const state of ['starting', 'refused', 'handover', 'serving'] as const) {
  test(`health and readiness in ${state}`, async () => {
    const health = healthResponse(
      new Request('http://localhost/healthz', {
        headers: { host: 'external.example', origin: 'https://external.example' },
      }),
      state,
      {},
    )!;
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({
      ok: true,
      version: null,
      commit: null,
      telemetry: { enabled: false, reason: 'not-started' },
    });
    const ready = healthResponse(new Request('http://localhost/readyz'), state, {})!;
    const expected = state === 'serving' || state === 'handover';
    expect(ready.status).toBe(expected ? 200 : 503);
    expect(await ready.json()).toEqual({ ready: expected, state });
    const data = healthResponse(new Request('http://localhost/api/projects'), state, {});
    expect(data?.status ?? 200).toBe(state === 'serving' ? 200 : 503);
    if (data) expect(data.headers.get('Retry-After')).toBe('10');
  });
}

test('static assets, fallback, traversal, namespaces and security headers', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workbench-static-'));
  try {
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'index.html'), '<main>Workbench</main>');
    writeFileSync(join(root, 'assets/app.js'), 'export {};');
    const request = (path: string) =>
      new Request(`http://localhost${path}`, {
        headers: { host: 'external.example', origin: 'https://external.example' },
      });
    const index = await serveStatic(request('/projects/one'), root);
    expect(await index!.text()).toContain('Workbench');
    expect(index!.headers.get('Cache-Control')).toBe('no-cache');
    expect(index!.headers.get('Content-Security-Policy')).toContain("worker-src 'self' blob:");
    expect(index!.headers.get('Content-Security-Policy')).toContain("script-src 'self'");
    expect(index!.headers.get('Content-Security-Policy')).toBe(
      "default-src 'self'; script-src 'self'; worker-src 'self' blob:; " +
        "img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
        "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    );
    expect(index!.headers.get('Content-Security-Policy')).not.toContain('unsafe-eval');
    expect(index!.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(index!.headers.get('Referrer-Policy')).toBe('same-origin');
    expect(index!.headers.has('Strict-Transport-Security')).toBe(false);
    const asset = await serveStatic(request('/assets/app.js'), root);
    expect(asset!.headers.get('Content-Type')).toContain('javascript');
    expect(asset!.headers.get('Cache-Control')).toContain('immutable');
    for (const mode of ['local', 'server'] as const) {
      const cached = await serveStatic(request('/assets/app.js'), root, undefined, mode);
      expect(cached!.headers.get('Cache-Control')).toBe(
        `${mode === 'server' ? 'private' : 'public'}, max-age=31536000, immutable`,
      );
      const html = await serveStatic(request('/projects/one'), root, undefined, mode);
      expect(html!.headers.get('Cache-Control')).toBe(mode === 'server' ? 'no-store' : 'no-cache');
    }
    expect((await serveStatic(request('/missing.js'), root))!.status).toBe(404);
    expect((await serveStatic(request('/%2e%2e%2fsecret'), root))!.status).toBe(403);
    expect(await serveStatic(request('/api/projects'), root)).toBeNull();
    expect(await serveStatic(request('/auth/login'), root)).toBeNull();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('failed writable probe names the root and uid', () => {
  expect(() =>
    probeDataRoot('/read-only', 7, 1000, {
      prepare: () => {},
      write: () => {
        throw new Error('Read-only filesystem');
      },
      remove: () => {},
    }),
  ).toThrow('/read-only');
  expect(() =>
    probeDataRoot('/read-only', 7, 1000, {
      prepare: () => {},
      write: () => {
        throw new Error('Read-only filesystem');
      },
      remove: () => {},
    }),
  ).toThrow('1000');
});

test('configured origins keep API host and origin checks in force', async () => {
  const { openWorkspace } = await import('../../server/projects/workspace');
  const { createHandler } = await import('../../server/handler');
  const root = mkdtempSync(join(tmpdir(), 'workbench-origins-'));
  const workspace = await openWorkspace({ root, cacheDir: null });
  try {
    const handler = createHandler(workspace, { port: 4321 });
    for (const origin of ['http://localhost:4321', 'http://127.0.0.1:4321']) {
      const response = await handler(
        new Request('http://localhost:4321/api/projects', {
          headers: { origin, host: 'localhost:4321' },
        }),
      );
      expect(response.status).toBe(200);
    }
    for (const headers of [
      { origin: 'http://evil.test', host: 'localhost:4321' },
      { origin: 'http://localhost:4321', host: 'evil.test' },
    ]) {
      expect(
        (await handler(new Request('http://localhost/api/projects', { headers }))).status,
      ).toBe(403);
    }
    const health = healthResponse(new Request('http://localhost/healthz'), 'serving', {})!;
    expect((await handler(new Request('http://localhost/healthz'))).status).toBe(404);
    expect(await health.json()).toMatchObject({ ok: true, version: null, commit: null });
  } finally {
    workspace.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('cache directory is separate from durable workspace state', async () => {
  const { existsSync } = await import('node:fs');
  const { openWorkspace } = await import('../../server/projects/workspace');
  const root = mkdtempSync(join(tmpdir(), 'workbench-cache-'));
  const cacheDir = join(root, 'cache');
  const workspaceRoot = join(root, 'workspace');
  const workspace = await openWorkspace({ root: workspaceRoot, cacheDir });
  try {
    expect(workspace.layout.cache).toBe(join(cacheDir, 'cache.sqlite'));
    expect(existsSync(workspace.layout.cache)).toBe(true);
    expect(existsSync(join(workspaceRoot, 'cache.sqlite'))).toBe(false);
    expect(workspace.layout.state).toBe(join(workspaceRoot, 'state'));
  } finally {
    workspace.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('probe removes its file and reports deletion failures', () => {
  const root = mkdtempSync(join(tmpdir(), 'workbench-probe-'));
  try {
    probeDataRoot(root, process.pid, process.getuid?.());
    const operations: string[] = [];
    expect(() =>
      probeDataRoot(root, 7, 1000, {
        prepare: () => {},
        write: path => {
          operations.push(path);
        },
        remove: () => {
          throw new Error('Delete denied');
        },
      }),
    ).toThrow('1000');
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatch(new RegExp(`${root}/\\.write-probe-[0-9a-f-]{36}$`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('probes use distinct random paths even with the same process id', () => {
  const paths: string[] = [];
  const removed: string[] = [];
  const files = {
    prepare: () => {},
    write: (path: string) => {
      paths.push(path);
    },
    remove: (path: string) => {
      removed.push(path);
    },
  };
  probeDataRoot('/temporary-root', 1, 1000, files);
  probeDataRoot('/temporary-root', 1, 1000, files);
  expect(new Set(paths).size).toBe(2);
  expect(removed).toEqual(paths);
  for (const path of paths) expect(path).toMatch(/\.write-probe-[0-9a-f-]{36}$/);
});

for (const code of ['EACCES', 'EROFS', 'EPERM', 'EEXIST', 'ENOSPC', 'EIO']) {
  test(`probe preserves the meaning of ${code}`, () => {
    const cause = Object.assign(new Error(`Failure ${code}`), { code });
    const run = () =>
      probeDataRoot('/temporary-root', 1, 1000, {
        prepare: () => {},
        write: () => {
          throw cause;
        },
        remove: () => {},
      });
    if (['EACCES', 'EROFS', 'EPERM'].includes(code)) {
      expect(run).toThrow('not writable');
    } else {
      expect(run).toThrow(`Failure ${code}`);
      expect(run).not.toThrow('not writable');
    }
    try {
      run();
    } catch (error) {
      expect((error as Error).cause).toBe(cause);
    }
  });
}

test('hand-over is ready for orchestration while workspace traffic asks clients to retry', async () => {
  const readiness = healthResponse(new Request('http://localhost/readyz'), 'handover', {})!;
  expect(readiness.status).toBe(200);
  expect(await readiness.json()).toEqual({ ready: true, state: 'handover' });
  for (const path of ['/api/projects', '/auth/login']) {
    const response = healthResponse(new Request(`http://localhost${path}`), 'handover', {})!;
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('10');
    expect(await response.json()).toEqual({ error: 'Workspace unavailable', state: 'handover' });
  }
});

test('the sign-out form may follow the redirect to the provider and nowhere else', () => {
  const policy = securityHeaders(undefined, 'https://login.example.test').get(
    'Content-Security-Policy',
  );
  expect(policy).toContain("form-action 'self' https://login.example.test;");
  expect(securityHeaders().get('Content-Security-Policy')).toContain("form-action 'self';");
});
