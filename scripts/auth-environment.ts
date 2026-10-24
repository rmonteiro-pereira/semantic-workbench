// Starts disposable API processes against the same fixture used by access unit tests.
import { freeLoopbackPort, waitReady } from './helpers/processes';
import { tempDataDir } from '../tests/helpers/temp-data-dir';
import { randomBytes } from 'node:crypto';
import { authWorkspace } from '../tests/helpers/auth-workspace';
import { TEST_TENANT_ID, TEST_WORKBENCH_CLIENT } from '../tests/helpers/auth-identities';

/** Allocates a port outside the development servers. */
export const freeAuthPort = () => freeLoopbackPort([5173, 5180, 4310]);

/** Provider endpoints needed by a server-mode check. */
export type AuthProvider = { issuer: string; graphUrl?: string; kind: 'entra' | 'keycloak' };

/** Builds an isolated server environment with explicitly supplied development secrets. */
export function authEnvironment(
  root: string,
  url: string,
  provider: AuthProvider,
  sessionKey: string,
): Record<string, string> {
  return {
    SW_MODE: 'server',
    SW_HOST: '127.0.0.1',
    SW_PORT: new URL(url).port,
    SW_PUBLIC_URL: url,
    SW_SERVE_STATIC: '1',
    DATA_DIR: root,
    SW_CACHE_DIR: `${root}/cache`,
    SW_API_AUDIENCE: 'api://semantic-workbench',
    SW_OIDC_ISSUER: provider.issuer,
    SW_OIDC_PROVIDER: provider.kind,
    SW_ENTRA_TENANT_ID: TEST_TENANT_ID,
    SW_OIDC_CLIENT_ID: TEST_WORKBENCH_CLIENT.clientId,
    SW_OIDC_CLIENT_SECRET: TEST_WORKBENCH_CLIENT.secret,
    SW_SESSION_KEY: sessionKey,
    SW_BOOTSTRAP_ADMINS: 'bootstrap@example.invalid',
    ...(provider.graphUrl ? { SW_GRAPH_URL: provider.graphUrl } : {}),
  };
}

/** Keeps host identity configuration out of disposable API processes. */
export function authProcessEnvironment(
  inherited: NodeJS.ProcessEnv,
  settings: Record<string, string>,
) {
  const base = Object.fromEntries(
    Object.entries(inherited).filter(
      ([name]) =>
        !name.startsWith('SW_') && name !== 'DATA_DIR' && name !== 'CONTAINER_APP_REVISION',
    ),
  );
  return { ...base, ...settings };
}

/** Extra server settings and a change to the data root made before the server starts. */
export type AuthApiOptions = {
  env?: Record<string, string>;
  prepare?: (root: string) => void | Promise<void>;
};

/** Starts the built application with fixture grants and removes it even after startup failure. */
export async function startAuthApi(
  url: string,
  provider: AuthProvider | { mode: 'local' },
  options: AuthApiOptions = {},
) {
  const local = 'mode' in provider;
  const fixture = local
    ? localFixture()
    : await authWorkspace({ keycloak: provider.kind === 'keycloak' });
  let child: ReturnType<typeof Bun.spawn> | undefined;
  async function stop() {
    try {
      child?.kill('SIGTERM');
      await child?.exited;
    } finally {
      fixture.dispose();
    }
  }
  try {
    fixture.ws?.close();
    await options.prepare?.(fixture.root);
    const env = local
      ? {
          SW_MODE: 'local',
          SW_HOST: '127.0.0.1',
          SW_PORT: new URL(url).port,
          SW_SERVE_STATIC: '1',
          DATA_DIR: fixture.root,
          SW_CACHE_DIR: fixture.root + '/cache',
        }
      : authEnvironment(fixture.root, url, provider, randomBytes(32).toString('base64'));
    child = Bun.spawn([process.execPath, 'server/index.ts'], {
      env: authProcessEnvironment(process.env, { ...env, ...options.env }),
      stdout: 'inherit',
      stderr: 'inherit',
    });
    await waitReady(url);
    return { root: fixture.root, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

function localFixture() {
  const directory = tempDataDir('workbench-auth-local-');
  return { root: directory.root, dispose: directory.cleanup, ws: undefined };
}
