// Verifies session persistence and single-volume handover using the built server image.
import {
  runCommand as command,
  waitReady as waitAuthReady,
  withCleanup,
} from './helpers/processes';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chromium, type Page } from '@playwright/test';
import { authWorkspace } from '../tests/helpers/auth-workspace';
import { startMockOidc, type MockOidc } from '../tests/helpers/mock-oidc';
import type { Engine } from './image';
import { authEnvironment } from './auth-environment';
import { hardenedRunArguments } from './container-hardening';
import { check, signIn, signInChecks, type SignInTarget } from './helpers/sign-in';

/** Builds server container arguments with host-loopback provider access and isolated storage. */
export function serverContainerArguments(
  engine: Engine,
  container: { image: string; name: string; root: string },
  env: Record<string, string>,
) {
  const { image, name, root } = container;
  const mapping = engine === 'podman' ? ['--userns', 'keep-id:uid=1000,gid=1000'] : [];
  return [
    engine,
    'run',
    '-d',
    '--name',
    name,
    '--network',
    'host',
    ...hardenedRunArguments(),
    ...mapping,
    '-v',
    `${root}:/data${engine === 'podman' ? ':z' : ''}`,
    ...Object.entries({ ...env, DATA_DIR: '/data', SW_CACHE_DIR: '/tmp/sw-cache' }).flatMap(
      ([key, value]) => ['-e', `${key}=${value}`],
    ),
    image,
  ];
}

async function containerFixture(url: string) {
  const fixture = await authWorkspace();
  fixture.ws.close();
  const clientSecret = randomBytes(32).toString('base64url');
  let mock: MockOidc;
  try {
    mock = await startMockOidc({
      clientSecret,
      shape: 'entra',
      layout: 'entra',
      port: 0,
      redirectUris: [url + '/auth/callback'],
      postLogoutRedirectUris: [url + '/auth/signed-out'],
    });
  } catch (error) {
    fixture.dispose();
    throw error;
  }
  const env = authEnvironment(
    '/data',
    url,
    { ...mock, kind: 'entra' },
    randomBytes(32).toString('base64'),
  );
  env.SW_OIDC_CLIENT_SECRET = clientSecret;
  return { fixture, mock, env };
}

async function serverGroup(engine: Engine, image: string, url: string) {
  const { fixture, mock, env } = await containerFixture(url);
  const names: string[] = [];
  async function cleanup() {
    const removed = await Promise.allSettled(
      names.map(name => commandCaptured([engine, 'rm', '-f', name])),
    );
    try {
      await mock.stop();
    } finally {
      fixture.dispose();
    }
    const failures = removed.filter(result => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map(result => result.reason));
  }
  async function start(suffix: string, overrides: Record<string, string> = {}) {
    const name = `workbench-auth-${process.pid}-${suffix}`;
    names.push(name);
    await commandCaptured(
      serverContainerArguments(
        engine,
        { image, name, root: fixture.root },
        { ...env, ...overrides },
      ),
    );
    return name;
  }
  // Entra's authorize and logout endpoints sit beside the issuer, under endpointBase.
  return { issuer: mock.issuer, endpointBase: mock.endpointBase, start, clean: cleanup };
}

/** Checks the server image against a mock provider on host loopback. */
export async function authContainerCheck(engine: Engine, image: string, port: number) {
  const url = `http://127.0.0.1:${port}`;
  const group = await serverGroup(engine, image, url);
  await withCleanup(group.clean, async () => {
    const began = performance.now();
    const first = await group.start('first');
    await waitAuthReady(url);
    const health = await fetch(url + '/healthz');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
    const inspected = JSON.parse(await commandCaptured([engine, 'image', 'inspect', image]));
    const labels = inspected[0].Config.Labels;
    await command(
      [
        process.execPath,
        'run',
        'deploy:smoke',
        '--',
        url,
        labels['org.opencontainers.image.version'],
        labels['org.opencontainers.image.revision'],
        '--loopback',
      ],
      false,
      { ...process.env, SW_OIDC_ISSUER: group.issuer },
    );
    const target: SignInTarget = { url, issuer: group.endpointBase, kind: 'entra' };
    await containerSignIn(engine, first, target, began);
    await containerHandover(engine, first, port, group.start);
  });
}

async function containerSignIn(engine: Engine, first: string, target: SignInTarget, began: number) {
  const browser = await chromium.launch({ headless: true });
  try {
    const url = target.url;
    const page = await browser.newPage();
    try {
      await signIn(page, target, 'alice');
      assert(performance.now() - began < 30_000, 'Container sign-in exceeded 30 seconds');
      await check('restart preserves session and data', () =>
        restartPersistence(page, engine, first, url),
      );
    } finally {
      await page.close();
    }
    await signInChecks(browser, target);
  } finally {
    await browser.close();
  }
}

async function containerHandover(
  engine: Engine,
  first: string,
  port: number,
  start: (suffix: string, overrides?: Record<string, string>) => Promise<string>,
) {
  await check('same revision refused and different revision takes over', async () => {
    const secondUrl = `http://127.0.0.1:${port + 1}`;
    const second = await start('second', { SW_PORT: String(port + 1) });
    await waitAuthReady(secondUrl, 'refused', 503);
    assert(
      (await commandCaptured([engine, 'logs', second])).includes(
        'Only one replica per data root is supported.',
      ),
    );
    await commandCaptured([engine, 'stop', second]);
    await start('handover', {
      SW_PORT: String(port + 1),
      SW_COMMIT: 'auth-check-other-revision',
    });
    await waitAuthReady(secondUrl, 'handover');
    const response = await fetch(secondUrl + '/api/projects');
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '10');
    await commandCaptured([engine, 'stop', first]);
    const stopped = performance.now();
    await waitAuthReady(secondUrl, 'serving');
    assert(performance.now() - stopped < 30_000, 'Handover exceeded shutdown plus 30 seconds');
  });
}

async function restartPersistence(page: Page, engine: Engine, first: string, url: string) {
  const path = url + '/api/projects/sales-contracts/files/orders.odcs.yaml';
  const file = await (await page.request.get(path)).json();
  const source = file.source + '\n# Persistence check\n';
  const saved = await page.request.put(path, {
    headers: { Origin: url, 'X-SW-Request': '1' },
    data: { baseHash: file.hash, source },
  });
  assert.equal(saved.status(), 200);
  const before = await (await page.request.get(url + '/api/projects')).json();
  const cookies = await page.context().cookies(url);
  await commandCaptured([engine, 'restart', first]);
  await waitAuthReady(url);
  const identity = await page.request.get(url + '/api/me');
  assert.equal(identity.status(), 200);
  assert.equal((await identity.json()).name, 'Alice Andrade');
  assert.deepEqual(await page.context().cookies(url), cookies);
  assert.deepEqual(await (await page.request.get(url + '/api/projects')).json(), before);
  assert.equal((await (await page.request.get(path)).json()).source, source);
}

function commandCaptured(args: string[]) {
  return command(args, true);
}
