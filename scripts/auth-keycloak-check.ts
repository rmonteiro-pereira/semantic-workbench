// Runs the owner's compatibility check with an ephemeral, digest-pinned provider.
import { runCommand as command, waitUntil, isConnectionRetry, withCleanup } from './helpers/processes';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import realm from '../tests/fixtures/keycloak/realm.json';
import { TEST_CLIENTS } from '../tests/helpers/auth-identities';
import { chooseEngine, type Engine } from './image';
import { freeAuthPort, startAuthApi } from './auth-environment';
import { check, signIn, signInChecks, type SignInTarget } from './helpers/sign-in';
import { liveUpdateCheck } from './auth-lifecycle';

/** Reviewed Linux amd64 provider image used only by owner compatibility checks. */
export const keycloakImage = 'quay.io/keycloak/keycloak:26.4@sha256:4ee8200b0fd00de0e3743b48220f4feadbdb52deb29730ed804f9364bc2be23f';

/** Rewrites only browser callback addresses in a disposable copy of the test realm. */
export function keycloakRealm(url: string) {
  const copy = structuredClone(realm);
  const client = copy.clients.find(entry => entry.clientId === 'semantic-workbench')!;
  client.redirectUris = [url + '/auth/callback'];
  client.attributes!['post.logout.redirect.uris'] = url + '/auth/signed-out';
  return copy;
}

/** Builds a loopback-only provider command with a read-only realm import. */
export function keycloakArguments(engine: Engine, name: string, port: number, path: string) {
  return [
    engine,
    'run',
    '-d',
    '--name',
    name,
    '--platform',
    'linux/amd64',
    '-p',
    `127.0.0.1:${port}:8080`,
    '-v',
    `${path}:/opt/keycloak/data/import/workbench.json:ro${engine === 'podman' ? ',Z' : ''}`,
    keycloakImage,
    'start-dev',
    '--import-realm',
  ];
}

/** Requires realm discovery to identify this instance and its authorization endpoint. */
export function validDiscovery(body: any, issuer: string) {
  return body?.issuer === issuer && typeof body.authorization_endpoint === 'string' && body.authorization_endpoint.startsWith(issuer + '/');
}

async function waitKeycloak(issuer: string) {
  await waitUntil(
    'Keycloak realm discovery',
    async () => {
      try {
        const response = await fetch(issuer + '/.well-known/openid-configuration', {
          signal: AbortSignal.timeout(1000),
        });
        return response.ok && validDiscovery(await response.json(), issuer);
      } catch (error) {
        if (!isConnectionRetry(error)) throw error;
        return false;
      }
    },
    120_000,
  );
}

/** Validates the parsed client-credentials response without exposing the issued token. */
export function assertAgentCredentials(value: unknown) {
  assert(value && typeof value === 'object', 'Expected a token response object');
  assert('token_type' in value && typeof value.token_type === 'string');
  assert.equal(value.token_type.toLowerCase(), 'bearer');
  assert('access_token' in value && typeof value.access_token === 'string');
  assert(value.access_token.length > 0, 'Expected a nonempty agent token');
}

async function agentCredentials(issuer: string) {
  for (const client of Object.values(TEST_CLIENTS)) {
    const response = await fetch(issuer + '/protocol/openid-connect/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: client.clientId,
        client_secret: client.secret,
      }),
    });
    assert.equal(response.status, 200);
    assertAgentCredentials(await response.json());
  }
}

/** Starts and removes the compatibility provider, including when interrupted. */
export async function authKeycloakCheck() {
  const engine = chooseEngine(['docker', 'podman'].filter(name => Bun.which(name)));
  const directory = await mkdtemp(join(tmpdir(), 'workbench-keycloak-'));
  const name = `workbench-keycloak-${process.pid}`;
  const port = freeAuthPort();
  const url = `http://127.0.0.1:${freeAuthPort()}`;
  const issuer = `http://127.0.0.1:${port}/realms/workbench`;
  let started = false;
  let stopApplication: (() => Promise<void>) | undefined;
  async function clean() {
    try {
      try {
        await stopApplication?.();
      } finally {
        if (started) await commandCaptured([engine, 'rm', '-f', name]);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  await withCleanup(clean, async () => {
    const path = join(directory, 'realm.json');
    await writeFile(path, JSON.stringify(keycloakRealm(url)));
    started = true;
    await commandCaptured(keycloakArguments(engine, name, port, path));
    await waitKeycloak(issuer);
    await runCompatibility({ url, issuer, kind: 'keycloak' }, stop => {
      stopApplication = stop;
    });
  });
}

async function runCompatibility(target: SignInTarget, registerStop: (stop: () => Promise<void>) => void) {
  const api = await startAuthApi(target.url, { issuer: target.issuer, kind: 'keycloak' });
  let browser: Browser | undefined;
  let stopping: Promise<void> | undefined;
  const stop = () =>
    (stopping ??= (async () => {
      try {
        await browser?.close();
      } finally {
        await api.stop();
      }
    })());
  registerStop(stop);
  try {
    browser = await chromium.launch({ headless: true });
    await signInChecks(browser, target);
    const page = await browser.newPage();
    try {
      await signIn(page, target, 'alice');
      await check('Keycloak live updates', () => liveUpdateCheck(page, target, api.root));
      await check('agent client credentials', () => agentCredentials(target.issuer));
    } finally {
      await page.close();
    }
  } finally {
    await stop();
  }
}

if (import.meta.main) await authKeycloakCheck();

function commandCaptured(args: string[]) {
  return command(args, true);
}
