// Builds isolated Source Control fixtures with local repositories and an optional second clone.
import { expect } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testWorkspace } from './temp-data-dir';
// Source Control fixtures: an isolated workspace with one project, a local bare remote and a
// second clone standing for "someone else" — never a network remote or the owner's repositories.
/** Calls the workspace HTTP handler and returns the status and decoded JSON body. */
export const call = async (workspace: { handler: (request: Request) => Promise<Response> }, method: string, path: string, body?: unknown) => {
  const response = await workspace.handler(
    new Request('http://127.0.0.1:4310' + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
  return { status: response.status, body: await response.json().catch(() => null) };
};
/** Requires a successful HTTP result and returns its body. */
export const ok = async (pendingCall: Promise<{ status: number; body: any }>) => {
  const response = await pendingCall;
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body;
};
/** Runs Git in the supplied directory without prompting and returns stdout. */
export function sh(cwd: string, args: string[]) {
  const syncSubprocess = Bun.spawnSync(['git', ...args], {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (syncSubprocess.exitCode !== 0) throw Error(`git ${args.join(' ')}: ${syncSubprocess.stderr.toString()}`);
  return syncSubprocess.stdout.toString();
}
/** Builds a minimal shop ontology with the supplied customer description. */
export const ontology = (desc: string) => `name: Shop\nontology:\n  - concept: Customer\n    type: EntityType\n    description: ${desc}\n  - concept: Order\n    type: EntityType\n`;
/** Creates a disposable project with optional local remote and second clone. */
export async function scmProject(options: { remote?: boolean } = {}) {
  const workspace = await testWorkspace();
  const created = await ok(
    call(workspace, 'POST', '/api/import', {
      files: [{ path: 'shop.yaml', source: ontology('Buys.') }],
    }),
  );
  const slug = created.slug;
  const dir = join(workspace.root, 'projects', slug);
  const base = `/api/projects/${slug}`;
  const extra = mkdtempSync(join(tmpdir(), 'workbench-remote-'));
  let bare = '';
  let other = '';
  if (options.remote !== false) {
    bare = join(extra, 'remote.git');
    sh(extra, ['init', '-q', '--bare', '-b', 'main', bare]);
    await ok(call(workspace, 'PUT', base + '/git/remote', { name: 'origin', url: bare }));
    await ok(call(workspace, 'POST', base + '/git/push'));
    other = join(extra, 'other');
    sh(extra, ['clone', '-q', bare, other]);
  }
  return {
    t: workspace,
    slug,
    dir,
    base,
    bare,
    other,
    write: (path: string, text: string) => writeFileSync(join(dir, path), text),
    dispose() {
      workspace.dispose();
      rmSync(extra, { recursive: true, force: true });
    },
  };
}
