// Runs the assertions for the project export mutants against a candidate module. Each category
// exercises exactly the decisions of the module its mutants change.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requestAccess } from '../src/server/auth/request-scope';
import { createGit } from '../src/server/projects/git';
import { dataLayout } from '../src/server/projects/paths';
import { LOCAL_READER } from '../src/server/projects/reader';
import { readZip } from '../tests/helpers/zip-reader';

const NO_HISTORY = { includeHistory: false, historyAllowed: true };
const WITH_HISTORY = { includeHistory: true, historyAllowed: true };
const HIDDEN_FILE = 'secret.txt';

function filterCase(candidate: any) {
  const paths = ['a.yaml', '.git/config', 'sub/.git/HEAD', 'x.yaml.workbench-tmp', 'secret/b.yaml'];
  const { included, restricted } = candidate.selectExportPaths(paths, (path: string) => !path.startsWith('secret/'));
  assert.deepEqual(included, ['a.yaml']);
  assert.equal(restricted, 1);
}

type Fixture = { root: string; layout: any; git: any; repo: string; cleanup: () => void };

function sh(cwd: string, ...args: string[]) {
  const result = Bun.spawnSync(['git', ...args], { cwd });
  assert.equal(result.exitCode, 0, result.stderr.toString());
}

// A repository with one committed file and one that a server reader may not read; with `inside`
// the project is the repository's `team` folder instead of the repository itself.
function fixture(inside = false): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'export-mutants-'));
  const layout = dataLayout(root);
  const repo = join(layout.projects, 'demo');
  const folder = inside ? join(repo, 'team') : repo;
  mkdirSync(folder, { recursive: true });
  layout.locate = () => ({ folder: inside ? 'demo/team' : 'demo', repo: 'demo' });
  writeFileSync(join(folder, 'a.txt'), 'line one\r\nline two\r\n\r\n');
  writeFileSync(join(folder, HIDDEN_FILE), 'hidden');
  sh(repo, 'init', '-q', '-b', 'main');
  sh(repo, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'add', '-A');
  sh(repo, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'one');
  const git = createGit({ projectsRoot: layout.projects });
  return { root, layout, git, repo, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function deps(env: Fixture, maxBytes = 1_000_000) {
  return {
    layout: env.layout,
    git: env.git,
    gitAvailable: true,
    scratchDir: join(env.root, 'scratch'),
    maxBytes,
    listPaths: (dir: string) => env.git.lsFiles(dir),
  };
}

const serverReader = (hidden: string[] = [HIDDEN_FILE]) => ({
  view: { canRead: (_project: string, path: string) => !hidden.includes(path) },
  owner: 'person',
  guard: () => ({ changes: [], refused: [], demoted: [] }),
});

async function bundleHeads(bytes: Uint8Array, folder: string) {
  const file = join(folder, 'check.bundle');
  writeFileSync(file, bytes);
  const result = Bun.spawnSync(['git', 'bundle', 'list-heads', file]);
  return result.stdout.toString();
}

async function planCase(candidate: any) {
  const env = fixture();
  try {
    const plan = await candidate.planProjectExport(deps(env), 'demo', serverReader(), NO_HISTORY);
    assert.equal(plan.omittedCount, 1);
    assert.deepEqual(plan.entries.map((entry: any) => entry.name).sort(), ['a.txt']);
    // The file's bytes, including CRLF and the trailing blank line, leave unchanged.
    const bytes = plan.entries[0].read();
    assert.equal(new TextDecoder().decode(bytes), 'line one\r\nline two\r\n\r\n');
    await assert.rejects(candidate.planProjectExport(deps(env, 5), 'demo', LOCAL_READER, NO_HISTORY), { name: 'TooLargeError' });
    await historyCases(candidate, env);
  } finally {
    env.cleanup();
  }
}

async function historyCases(candidate: any, env: Fixture) {
  // Refused while the reader cannot read a file the history holds.
  await assert.rejects(candidate.planProjectExport(deps(env), 'demo', serverReader(), WITH_HISTORY), { name: 'BadRequestError' });
  const readsAll = serverReader([]);
  const allowed = await candidate.planProjectExport(deps(env), 'demo', readsAll, WITH_HISTORY);
  assert.equal(allowed.includesHistory, true);
  await assert.rejects(
    candidate.planProjectExport(deps(env), 'demo', readsAll, {
      includeHistory: true,
      historyAllowed: false,
    }),
    { name: 'BadRequestError' },
  );
  // A file the reader cannot read closes the history even when no commit holds it yet.
  writeFileSync(join(env.repo, 'private.txt'), 'uncommitted');
  await assert.rejects(candidate.planProjectExport(deps(env), 'demo', serverReader(['private.txt']), WITH_HISTORY), { name: 'BadRequestError' });
  rmSync(join(env.repo, 'private.txt'));
  // An old commit that touched a file the reader may not read keeps the history closed even
  // when the file is gone from the current tree.
  sh(env.repo, 'rm', '-q', HIDDEN_FILE);
  sh(env.repo, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'x');
  await assert.rejects(candidate.planProjectExport(deps(env), 'demo', serverReader(), WITH_HISTORY), { name: 'BadRequestError' });
  // A server reader gets the checked-out branch only; a local person gets every branch.
  sh(env.repo, 'branch', 'other-persons-work');
  const own = await candidate.planProjectExport(deps(env), 'demo', readsAll, WITH_HISTORY);
  const ownBundle = own.entries.find((entry: any) => entry.name === 'git-history.bundle');
  const heads = await bundleHeads(ownBundle.read(), env.root);
  assert(!heads.includes('other-persons-work'), heads);
  const local = await candidate.planProjectExport(deps(env), 'demo', LOCAL_READER, WITH_HISTORY);
  const localBundle = local.entries.find((entry: any) => entry.name === 'git-history.bundle');
  assert((await bundleHeads(localBundle.read(), env.root)).includes('other-persons-work'));
  // The bundle counts against the limit.
  await assert.rejects(candidate.planProjectExport(deps(env, 30), 'demo', LOCAL_READER, WITH_HISTORY), { name: 'TooLargeError' });
  await subfolderCase(candidate);
}

async function subfolderCase(candidate: any) {
  const env = fixture(true);
  try {
    // Another project's history shares the repository, so a server reader is refused.
    await assert.rejects(candidate.planProjectExport(deps(env), 'demo', serverReader([]), WITH_HISTORY), { name: 'BadRequestError' });
  } finally {
    env.cleanup();
  }
}

async function zipCase(candidate: any) {
  const binary = new Uint8Array([0xff, 0xfe, 0x00, 0x0d, 0x0a, 0x20, 0x0a]);
  const entries = [
    { name: 'a/trailing.txt', size: 9, read: () => new TextEncoder().encode('text\r\n \n\n') },
    { name: 'binary.bin', size: binary.length, read: () => binary },
    { name: 'ü.txt', size: 1, read: () => new Uint8Array([0x7a]) },
  ];
  const archive = new Uint8Array(await new Response(candidate.zipStream(entries)).arrayBuffer());
  assert.equal(archive.length, candidate.zipSize(entries));
  const stored = readZip(archive);
  assert.deepEqual([...stored.get('binary.bin')!], [...binary]);
  assert.equal(new TextDecoder().decode(stored.get('a/trailing.txt')!), 'text\r\n \n\n');
  assert.equal(stored.get('ü.txt')![0], 0x7a);
  const lying = [{ name: 'x', size: 99, read: () => new Uint8Array(3) }];
  await assert.rejects(new Response(candidate.zipStream(lying)).arrayBuffer());
}

async function routeCase(candidate: any) {
  const seen: any[] = [];
  const plan = { entries: [], fileCount: 0, omittedCount: 4, zipBytes: 22, includesHistory: false };
  const ws = {
    exportProject: async (_slug: string, _reader: unknown, options: unknown) => {
      seen.push(options);
      return plan;
    },
  };
  const ask = async (query: string) => {
    const request: any = new Request('http://127.0.0.1/api/projects/demo/export' + query);
    request[requestAccess] = { principal: { kind: 'local' }, authorize: () => ({ allow: false }) };
    return candidate.exportRoutes(ws, request, new URL(request.url));
  };
  const response = await ask('');
  assert.equal(response.headers.get('x-export-omitted'), '4');
  await ask('?history=1');
  await ask('?history=0');
  assert.deepEqual(seen, [
    { includeHistory: false, historyAllowed: false },
    { includeHistory: true, historyAllowed: false },
    { includeHistory: false, historyAllowed: false },
  ]);
  await assert.rejects(ask('?history=maybe'), { name: 'BadRequestError' });
}

function accessCase(candidate: any) {
  const target = candidate.routeFor('GET', '/api/projects/demo/export', 'server');
  assert.equal(target.row.action, 'export');
  assert.equal(target.row.audited, true);
}

/** Runs the assertions of one export mutant category against the candidate module. */
export async function exportMutationCase(candidate: any, category: string) {
  if (category === 'export-filter') filterCase(candidate);
  if (category === 'export-plan') await planCase(candidate);
  if (category === 'export-zip') await zipCase(candidate);
  if (category === 'export-route') await routeCase(candidate);
  if (category === 'export-access') accessCase(candidate);
}
