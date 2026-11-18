// Runs the tessera command as a child process against a temporary Git repository and checks its output, its exit statuses and what it writes.
import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateInput } from '../../src/shared/validation/input';
import { COMMITTED_FILES, ONTOLOGY_TEXT, PROJECT_FOLDER, createTesseraRepository, type TesseraRepository } from '../helpers/tessera-repository';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

type Scene = { repository: TesseraRepository; base: string; out: string };

function scene(): Scene {
  const repository = createTesseraRepository();
  const base = mkdtempSync(join(tmpdir(), 'tessera-cli-'));
  cleanups.push(() => rmSync(base, { recursive: true, force: true }), repository.dispose);
  return { repository, base, out: join(base, 'bundle') };
}

// The command must work with no network and no credentials: the proxy points nowhere and the environment holds only what Git and Bun need.
function run(args: string[], home: string) {
  const env = {
    PATH: process.env.PATH!,
    HOME: home,
    HTTP_PROXY: 'http://127.0.0.1:9',
    HTTPS_PROXY: 'http://127.0.0.1:9',
    ALL_PROXY: 'http://127.0.0.1:9',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
  };
  const result = Bun.spawnSync(['bun', 'scripts/tessera.ts', ...args], { cwd: process.cwd(), env });
  return { status: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

const compileArgs = (s: Scene, more: string[] = []) => ['compile', '--repository', s.repository.directory, '--project-folder', PROJECT_FOLDER, '--out', s.out, ...more];

function digestOf(s: Scene, more: string[] = []): string {
  const result = run([...compileArgs(s, more), '--json'], s.base);
  return JSON.parse(result.stdout).report.digest;
}

function readBundle(out: string, path: string): string {
  return readFileSync(join(out, path), 'utf8');
}

test('compile without acceptance writes nothing, prints the report digest and exits 2', () => {
  const s = scene();
  const result = run(compileArgs(s), s.base);
  expect(result.status).toBe(2);
  expect(result.stdout).toMatch(/Digest: sha256:[0-9a-f]{64}/);
  expect(result.stdout).toContain('the loss needs acceptance');
  expect(existsSync(s.out)).toBe(false);
});

test('compile with the digest writes a bundle of the committed snapshot only', () => {
  const s = scene();
  s.repository.editWithoutCommit(`${PROJECT_FOLDER}/ontology.yaml`, ONTOLOGY_TEXT + '# UNCOMMITTED-EDIT\n');
  s.repository.editWithoutCommit(`${PROJECT_FOLDER}/untracked.yaml`, 'name: untracked\n');
  s.repository.addPersonalBranch('personal/someone');
  const digest = digestOf(s);
  const result = run(compileArgs(s, ['--accept-loss', digest]), s.base);
  expect(result.status).toBe(0);
  expect(readdirSync(s.out).sort()).toEqual(['loss-report.json', 'manifest.json', 'mapping.yaml', 'ontology.yaml', 'semantic-model.yaml']);
  const ontology = readBundle(s.out, 'ontology.yaml');
  expect(ontology).not.toContain('tessera');
  expect(ontology).not.toContain('UNCOMMITTED-EDIT');
  expect(ontology).not.toContain('personal branch');
  expect(readBundle(s.out, 'semantic-model.yaml')).toBe(COMMITTED_FILES[`${PROJECT_FOLDER}/semantic-model.yaml`]);
  expect(readBundle(s.out, 'mapping.yaml')).toBe(COMMITTED_FILES[`${PROJECT_FOLDER}/mapping.yaml`]);
  const manifest = JSON.parse(readBundle(s.out, 'manifest.json'));
  expect(manifest.source).toEqual({ kind: 'published-snapshot', branch: 'main', commit: s.repository.firstCommit, projectFolder: PROJECT_FOLDER });
  expect(manifest.loss).toEqual({ digest, accepted: 'digest' });
  expect(JSON.parse(readBundle(s.out, 'loss-report.json')).digest).toBe(digest);
  expect(result.stdout).toContain('Accepting a loss report is not approval of the exported content.');
});

test('every file of the bundle that is Ossie validates against the pinned schemas with no notice', () => {
  const s = scene();
  expect(run(compileArgs(s, ['--accept-loss', digestOf(s)]), s.base).status).toBe(0);
  for (const name of ['ontology.yaml', 'semantic-model.yaml', 'mapping.yaml']) {
    const result = validateInput(readBundle(s.out, name), name);
    expect(result.valid).toBe(true);
    expect(result.issues.filter(issue => issue.code === 'not-validated')).toEqual([]);
  }
});

test('an output folder inside the repository exits 1 before writing anything', () => {
  const s = scene();
  const inside = join(s.repository.directory, 'dist');
  const result = run(['compile', '--repository', s.repository.directory, '--project-folder', PROJECT_FOLDER, '--out', inside], s.base);
  expect(result.status).toBe(1);
  expect(existsSync(inside)).toBe(false);
});

test('a repository with no commit exits 1 and says there is no published snapshot', () => {
  const s = scene();
  const empty = join(s.base, 'empty');
  mkdirSync(empty);
  Bun.spawnSync(['git', 'init', '-q', '-b', 'main'], { cwd: empty });
  const result = run(['compile', '--repository', empty, '--out', s.out], s.base);
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('no published snapshot');
});

test('--json prints one object with result, source, findings, report and bundle', () => {
  const s = scene();
  const result = run([...compileArgs(s, ['--accept-loss', digestOf(s)]), '--json'], s.base);
  expect(result.status).toBe(0);
  const output = JSON.parse(result.stdout);
  expect(Object.keys(output).sort()).toEqual(['bundle', 'findings', 'report', 'result', 'source']);
  expect(output.result).toBe('compiled');
  expect(output.source.commit).toBe(s.repository.firstCommit);
  expect(output.bundle.files).toContain('manifest.json');
  expect(output.report.losses).toHaveLength(3);
});

test('the command works with an unroutable proxy and no credentials', () => {
  const s = scene();
  expect(run(compileArgs(s, ['--accept-loss', digestOf(s)]), s.base).status).toBe(0);
});

test('misuse exits 64 and names the mistake', () => {
  const s = scene();
  const result = run(['compile', '--repository', s.repository.directory], s.base);
  expect(result.status).toBe(64);
  expect(result.stderr).toContain('compile needs --out');
});
