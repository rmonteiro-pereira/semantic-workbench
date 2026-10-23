// Signs fixture people into one server-mode workspace, so tests can act as several people on the
// same repositories and look at their working copies on disk.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAccessControl } from '../../server/auth/authorize';
import type { NormalizedPrincipal } from '../../server/auth/principal';
import { createHandler } from '../../server/handler';
import type { Workspace } from '../../server/projects/workspace';
import { TEST_GROUPS } from '../helpers/auth-identities';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { accessFixture, person } from './access-fixture';

/** The public origin every server-mode request of these tests comes from. */
export const ORIGIN = 'http://127.0.0.1:4310';

/** A same-origin API request with the markers server mode requires. */
export function apiRequest(path: string, method = 'GET', body?: unknown) {
  return new Request(ORIGIN + path, {
    method,
    headers: { Origin: ORIGIN, 'X-SW-Request': '1', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Carol's identity narrowed to the Sales Viewers group: a Viewer of the Sales projects. */
export const salesViewer = (): NormalizedPrincipal => ({
  ...person('carol'),
  groups: [TEST_GROUPS.salesViewers.id],
});

/** Opens handlers for people of the access fixture, each recorded as a signed-in user. */
export function signedIn(ws: Workspace, access = createAccessControl(accessFixture())) {
  return (identity: NormalizedPrincipal) => {
    const principal = access.principalFor(identity);
    ws.state.recordUser(principal, new Date().toISOString());
    const handler = createHandler(ws, {
      mode: 'server',
      remoteCredentials: allowEveryRemote(),
      publicOrigin: ORIGIN,
      access,
      principal: () => access.principalFor(identity),
    });
    const call = async (path: string, method = 'GET', body?: unknown) => {
      const response = await handler(apiRequest(path, method, body));
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    };
    return { principal, call };
  };
}

/** Runs Git in a folder of the test and returns its trimmed output. */
export function gitOutput(cwd: string, args: string[]) {
  const result = Bun.spawnSync(['git', ...args], { cwd });
  return { code: result.exitCode, text: result.stdout.toString().trim() };
}

/** The working copy folder of one person's copy of a repository. */
export const copyFolder = (ws: Workspace, key: string, repo: string) =>
  join(ws.layout.worktrees, key, repo);

/** A file's text in a folder. */
export const textAt = (folder: string, path: string) => readFileSync(join(folder, path), 'utf8');

/** Saves new text over a file through the API, based on the version the person reads. */
export async function saveText(
  call: ReturnType<ReturnType<typeof signedIn>>['call'],
  project: string,
  path: string,
  edit: (text: string) => string,
) {
  const file = `/api/projects/${project}/files/${path}`;
  const current = await call(file);
  return call(file, 'PUT', { baseHash: current.body.hash, source: edit(current.body.source) });
}

/**
 * Starts a person's working copy without changing a file: staging everything when nothing is
 * changed is the smallest change a person can make.
 */
export async function openCopy(
  call: ReturnType<ReturnType<typeof signedIn>>['call'],
  project: string,
) {
  return call(`/api/projects/${project}/git/stage`, 'POST', { all: true });
}
