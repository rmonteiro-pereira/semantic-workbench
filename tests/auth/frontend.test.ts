import { expect, test } from 'bun:test';
import { apiFetch } from '../../src/projects/api';
import { personRoles, loadIdentity } from '../../src/auth/useMe';

test('API wrapper preserves request options, marks writes and reloads only once', async () => {
  const originalFetch = globalThis.fetch;
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const calls: RequestInit[] = [];
  let reloads = 0;
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: {
      reload() {
        reloads++;
      },
    },
  });
  globalThis.fetch = (async (_input: unknown, options: RequestInit) => {
    calls.push(options);
    return new Response('{}', { status: 401 });
  }) as typeof fetch;
  try {
    const signal = new AbortController().signal;
    await apiFetch('/api/projects', {
      method: 'POST',
      body: '{}',
      signal,
      headers: { 'Content-Type': 'application/json' },
    });
    await apiFetch('/api/me');
    expect(reloads).toBe(1);
    expect(new Headers(calls[0].headers).get('X-SW-Request')).toBe('1');
    expect(new Headers(calls[0].headers).get('Content-Type')).toBe('application/json');
    expect(calls[0].body).toBe('{}');
    expect(calls[0].signal).toBe(signal);
    expect(calls[0].method).toBe('POST');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation);
    else Reflect.deleteProperty(globalThis, 'location');
  }
});

test('person summary includes custom names and deduplicates scoped role ids', () => {
  expect(
    personRoles({
      mode: 'server',
      name: 'Alice',
      verifiedEmail: 'alice@example.org',
      roles: { workspace: ['admin'], projects: { sales: ['editor', 'custom'], hr: ['editor'] } },
      roleNames: { admin: 'Admin', editor: 'Editor', custom: 'Metric reviewer' },
    }),
  ).toEqual(['Admin', 'Editor', 'Metric reviewer']);
});

test('identity retries a rejected request and shares the successful promise', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const identity = {
    mode: 'local' as const,
    name: '',
    verifiedEmail: null,
    roles: { workspace: [], projects: {} },
    roleNames: {},
  };
  globalThis.fetch = (async (_input: unknown) => {
    calls++;
    if (calls === 1) throw new Error('private diagnostic');
    return Response.json(identity);
  }) as typeof fetch;
  try {
    await expect(loadIdentity()).rejects.toThrow('private diagnostic');
    const retry = loadIdentity();
    expect(loadIdentity()).toBe(retry);
    expect(await retry).toEqual(identity);
    expect(calls).toBe(2);
  } finally {
    globalThis.fetch = original;
  }
});

test('the sidebar names one hidden file in the singular', async () => {
  const { hiddenFilesLine } = await import('../../src/projects/Sidebar');
  expect(hiddenFilesLine(1)).toBe('1 file you cannot open');
  expect(hiddenFilesLine(3)).toBe('3 files you cannot open');
});
