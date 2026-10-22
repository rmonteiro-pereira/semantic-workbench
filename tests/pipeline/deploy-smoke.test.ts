import { expect, test } from 'bun:test';
import { smoke, smokeChecks } from '../../scripts/deploy-smoke';
import { startMockOidc } from '../helpers/mock-oidc';

const expected = { version: '0.4.0', commit: 'a'.repeat(40) };
const endpoint = 'https://provider.example/authorize';
function responses() {
  const headers = {
    location: `${endpoint}?code_challenge_method=S256`,
    'strict-transport-security': 'max-age=31536000',
    'content-security-policy': "default-src 'self'",
    'x-content-type-options': 'nosniff',
    'set-cookie': '__Host-sw-auth=attempt; Secure; HttpOnly; Path=/',
  };
  return {
    ready: { status: 200, body: { ready: true, state: 'serving' } },
    health: { status: 200, body: { ...expected } },
    projects: { status: 401, body: { error: 'Unauthorized' } },
    home: new Response(null, { status: 302, headers }),
    login: new Response(null, { status: 302, headers }),
  };
}

test('all smoke predicates pass independently of sockets', () => {
  expect(smokeChecks(responses(), expected, endpoint, false).every(check => check.ok)).toBe(true);
});
const faults = [
  (input: ReturnType<typeof responses>) => {
    input.ready.body.state = 'handover';
  },
  (input: ReturnType<typeof responses>) => {
    input.health.body.version = 'wrong';
  },
  (input: ReturnType<typeof responses>) => {
    input.health.body.commit = 'wrong';
  },
  (input: ReturnType<typeof responses>) => {
    input.projects.status = 200;
  },
  (input: ReturnType<typeof responses>) => {
    Object.assign(input.projects.body, { projects: ['secret'] });
  },
  (input: ReturnType<typeof responses>) => {
    input.home = new Response('login');
  },
  (input: ReturnType<typeof responses>) => {
    input.login.headers.set('location', endpoint);
  },
  (input: ReturnType<typeof responses>) => {
    input.login.headers.delete('content-security-policy');
  },
  (input: ReturnType<typeof responses>) => {
    input.login.headers.delete('x-content-type-options');
  },
  (input: ReturnType<typeof responses>) => {
    input.login.headers.delete('set-cookie');
  },
];
for (const [index, fault] of faults.entries()) {
  test(`smoke fails isolated fault ${index} even on loopback`, () => {
    const input = responses();
    fault(input);
    expect(smokeChecks(input, expected, endpoint, true).some(check => !check.ok)).toBe(true);
  });
}

test('loopback relaxes only HSTS and Secure', () => {
  const input = responses();
  input.login.headers.delete('strict-transport-security');
  input.login.headers.set('set-cookie', 'sw-auth=attempt; HttpOnly; Path=/');
  expect(smokeChecks(input, expected, endpoint, false).some(check => !check.ok)).toBe(true);
  expect(smokeChecks(input, expected, endpoint, true).every(check => check.ok)).toBe(true);
});

for (const shape of ['entra', 'keycloak'] as const) {
  test(`local smoke discovers ${shape} authorization endpoint and waits out handover`, async () => {
    const provider = await startMockOidc({ shape });
    let probes = 0;
    const discovery = await fetch(`${provider.issuer}/.well-known/openid-configuration`);
    const document = (await discovery.json()) as { authorization_endpoint: string };
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === '/readyz') {
          probes++;
          return Response.json({ ready: true, state: probes === 1 ? 'handover' : 'serving' });
        }
        if (path === '/healthz') return Response.json(expected);
        if (path === '/api/projects')
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const response = responses().login;
        response.headers.set(
          'location',
          `${document.authorization_endpoint}?code_challenge_method=S256`,
        );
        return response;
      },
    });
    try {
      const result = await smoke(`http://127.0.0.1:${server.port}`, expected, {
        issuer: provider.issuer,
        loopback: true,
      });
      expect(result.ok).toBe(true);
      expect(probes).toBeGreaterThan(1);
    } finally {
      server.stop(true);
      await provider.stop();
    }
  });
}

for (const [index, fault] of faults.entries()) {
  test(`HTTP smoke rejects isolated fault ${index}`, async () => {
    const input = responses();
    fault(input);
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === '/.well-known/openid-configuration') {
          return Response.json({ authorization_endpoint: endpoint });
        }
        if (path === '/readyz') {
          // A handover response must recover before the rest of the checks can run.
          if (input.ready.body.state === 'handover') input.ready.body.state = 'serving';
          return Response.json(input.ready.body, { status: input.ready.status });
        }
        if (path === '/healthz')
          return Response.json(input.health.body, { status: input.health.status });
        if (path === '/api/projects') {
          return Response.json(input.projects.body, { status: input.projects.status });
        }
        return path === '/' ? input.home.clone() : input.login.clone();
      },
    });
    try {
      const url = `http://127.0.0.1:${server.port}`;
      const result = await smoke(url, expected, { issuer: url, loopback: true });
      expect(result.ok).toBe(index === 0);
    } finally {
      server.stop(true);
    }
  });
}

test('injected transport waits out handover and uses discovery without following redirects', async () => {
  let probes = 0;
  const observed: string[] = [];
  const request = (async (url: string | URL | Request, init?: RequestInit) => {
    const address = String(url);
    observed.push(address);
    expect(init?.redirect).toBe('manual');
    expect(init?.headers).toBeUndefined();
    if (address.endsWith('/.well-known/openid-configuration')) {
      return Response.json({ authorization_endpoint: endpoint });
    }
    if (address.endsWith('/readyz')) {
      probes++;
      return Response.json({ ready: true, state: probes === 1 ? 'handover' : 'serving' });
    }
    if (address.endsWith('/healthz')) return Response.json(expected);
    if (address.endsWith('/api/projects')) {
      return Response.json({ error: 'sign-in required' }, { status: 401 });
    }
    return responses().login;
  }) as typeof fetch;
  const result = await smoke('https://workbench.example', expected, {
    issuer: 'https://provider.example/realm',
    loopback: false,
    request,
  });
  expect(result.ok).toBe(true);
  expect(probes).toBe(2);
  expect(observed).toContain('https://provider.example/realm/.well-known/openid-configuration');
});

for (const header of ['strict-transport-security', 'set-cookie']) {
  test(`production smoke refuses missing ${header}`, () => {
    const input = responses();
    input.login.headers.delete(header);
    expect(smokeChecks(input, expected, endpoint, false).some(check => !check.ok)).toBe(true);
  });
}
