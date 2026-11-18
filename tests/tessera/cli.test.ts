// Runs the tessera command as a child process against a temporary Git repository and checks its output, its exit statuses and what it writes.
import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateInput } from '../../src/shared/validation/input';
import { COMMITTED_FILES, ONTOLOGY_TEXT, PROJECT_FOLDER, createTesseraRepository, type TesseraRepository } from '../helpers/tessera-repository';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

type Scene = { repository: TesseraRepository; base: string; home: string; out: string };

function scene(): Scene {
  const repository = createTesseraRepository();
  const base = mkdtempSync(join(tmpdir(), 'tessera-cli-'));
  // Bun keeps its own cache in HOME, so HOME sits outside the folder the tests compare before and after.
  const home = mkdtempSync(join(tmpdir(), 'tessera-home-'));
  cleanups.push(
    () => rmSync(base, { recursive: true, force: true }),
    () => rmSync(home, { recursive: true, force: true }),
    repository.dispose,
  );
  return { repository, base, home, out: join(base, 'bundle') };
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
  const result = run([...compileArgs(s, more), '--json'], s.home);
  return JSON.parse(result.stdout).report.digest;
}

function readBundle(out: string, path: string): string {
  return readFileSync(join(out, path), 'utf8');
}

test('compile without acceptance writes nothing, prints the report digest and exits 2', () => {
  const s = scene();
  const result = run(compileArgs(s), s.home);
  expect(result.status).toBe(2);
  expect(result.stdout).toMatch(/Digest: sha256:[0-9a-f]{64}/);
  expect(result.stdout).toContain('the loss needs acceptance');
  expect(existsSync(s.out)).toBe(false);
});

test('compile with the digest writes a bundle of the committed snapshot only', () => {
  const s = scene();
  s.repository.addPersonalBranch('personal/someone');
  s.repository.editWithoutCommit(`${PROJECT_FOLDER}/ontology.yaml`, ONTOLOGY_TEXT + '# UNCOMMITTED-EDIT\n');
  s.repository.editWithoutCommit(`${PROJECT_FOLDER}/untracked.yaml`, 'name: untracked\n');
  const digest = digestOf(s);
  const result = run(compileArgs(s, ['--accept-loss', digest]), s.home);
  expect(result.status).toBe(0);
  expect(readdirSync(s.out).sort()).toEqual(['loss-report.json', 'manifest.json', 'mapping.yaml', 'ontology.yaml', 'semantic-model.yaml']);
  const ontology = readBundle(s.out, 'ontology.yaml');
  expect(ontology).not.toContain('tessera');
  expect(ontology).not.toContain('UNCOMMITTED-EDIT');
  expect(ontology).not.toContain('personal branch');
  expect(readBundle(s.out, 'semantic-model.yaml')).toBe(COMMITTED_FILES[`${PROJECT_FOLDER}/semantic-model.yaml`]);
  expect(readBundle(s.out, 'mapping.yaml')).toBe(COMMITTED_FILES[`${PROJECT_FOLDER}/mapping.yaml`]);
  const manifest = JSON.parse(readBundle(s.out, 'manifest.json'));
  expect(manifest.source).toEqual({ kind: 'standalone-snapshot', branch: 'main', commit: s.repository.firstCommit, projectFolder: PROJECT_FOLDER });
  expect(manifest.loss).toEqual({ digest, accepted: 'digest' });
  expect(JSON.parse(readBundle(s.out, 'loss-report.json'))).toMatchObject({ digest, source: manifest.source });
  expect(result.stdout).toContain('Accepting a loss report is not approval of the exported content.');
});

test('every file of the bundle that is Ossie validates against the pinned schemas with no notice', () => {
  const s = scene();
  expect(run(compileArgs(s, ['--accept-loss', digestOf(s)]), s.home).status).toBe(0);
  for (const name of ['ontology.yaml', 'semantic-model.yaml', 'mapping.yaml']) {
    const result = validateInput(readBundle(s.out, name), name);
    expect(result.valid).toBe(true);
    expect(result.issues.filter(issue => issue.code === 'not-validated')).toEqual([]);
  }
});

test('an output folder inside the repository exits 1 before writing anything', () => {
  const s = scene();
  const inside = join(s.repository.directory, 'dist');
  const result = run(['compile', '--repository', s.repository.directory, '--project-folder', PROJECT_FOLDER, '--out', inside], s.home);
  expect(result.status).toBe(1);
  expect(existsSync(inside)).toBe(false);
});

test('a repository with no commit exits 1 and says there is no published snapshot', () => {
  const s = scene();
  const empty = join(s.base, 'empty');
  mkdirSync(empty);
  Bun.spawnSync(['git', 'init', '-q', '-b', 'main'], { cwd: empty });
  const result = run(['compile', '--repository', empty, '--out', s.out], s.home);
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('no published snapshot');
});

test('--json prints one object with result, source, findings, report and bundle', () => {
  const s = scene();
  const result = run([...compileArgs(s, ['--accept-loss', digestOf(s)]), '--json'], s.home);
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
  expect(run(compileArgs(s, ['--accept-loss', digestOf(s)]), s.home).status).toBe(0);
});

test('misuse exits 64 and names the mistake', () => {
  const s = scene();
  const result = run(['compile', '--repository', s.repository.directory], s.home);
  expect(result.status).toBe(64);
  expect(result.stderr).toContain('compile needs --out');
});

function policyFile(s: Scene, allow: string[]): string {
  const path = join(s.base, 'policy.json');
  writeFileSync(path, JSON.stringify({ policy: 1, allow }));
  return path;
}

test('a loss policy that allows the lost property accepts the loss and its hash goes in the manifest', () => {
  const s = scene();
  const policy = policyFile(s, ['tessera_notes']);
  const result = run(compileArgs(s, ['--loss-policy', policy]), s.home);
  expect(result.status).toBe(0);
  const manifest = JSON.parse(readBundle(s.out, 'manifest.json'));
  expect(manifest.loss.accepted).toBe('policy');
  expect(manifest.lossPolicySha256).toBe(createHash('sha256').update(readFileSync(policy)).digest('hex'));
  expect(JSON.parse(readBundle(s.out, 'loss-report.json')).options.lossPolicy).toBe(manifest.lossPolicySha256);
});

test('a loss policy that does not list the property leaves the compile at status 2', () => {
  const s = scene();
  const result = run(compileArgs(s, ['--loss-policy', policyFile(s, [])]), s.home);
  expect(result.status).toBe(2);
  expect(result.stdout).toContain('does not allow tessera_notes');
  expect(existsSync(s.out)).toBe(false);
});

test('a changed note invalidates its digest while the same policy still allows the property', () => {
  const s = scene();
  const policy = policyFile(s, ['tessera_notes']);
  const stale = digestOf(s);
  const priorOutput = join(s.base, 'prior-bundle');
  expect(run(compileArgs({ ...s, out: priorOutput }, ['--loss-policy', policy]), s.home).status).toBe(0);
  const prior = JSON.parse(readBundle(priorOutput, 'manifest.json'));
  s.repository.commitFile(`${PROJECT_FOLDER}/ontology.yaml`, ONTOLOGY_TEXT.replace('Ask finance before adding a Return concept.', 'Ask legal instead.'));
  const result = run(compileArgs(s, ['--accept-loss', stale]), s.home);
  const fresh = digestOf(s);
  expect(fresh).not.toBe(stale);
  expect(result.status).toBe(2);
  expect(result.stdout).toContain(fresh);
  expect(existsSync(s.out)).toBe(false);
  expect(run(compileArgs(s, ['--loss-policy', policy]), s.home).status).toBe(0);
  const revised = JSON.parse(readBundle(s.out, 'manifest.json'));
  expect(revised.loss.accepted).toBe('policy');
  expect(revised.loss.digest).not.toBe(prior.loss.digest);
  expect(revised.lossPolicySha256).toBe(prior.lossPolicySha256);
});

test('a schema failure is never accepted, even with the right digest', () => {
  const s = scene();
  const digest = digestOf(s);
  s.repository.commitFile(`${PROJECT_FOLDER}/semantic-model.yaml`, 'version: 0.2.0.dev0\nname: broken\ndatasets: []\n');
  const result = run(compileArgs(s, ['--accept-loss', digest]), s.home);
  expect(result.status).toBe(1);
  expect(existsSync(s.out)).toBe(false);
});

test('a malformed loss policy file is misuse', () => {
  const s = scene();
  const path = join(s.base, 'bad.json');
  writeFileSync(path, '{"policy":2,"allow":[]}');
  expect(run(compileArgs(s, ['--loss-policy', path]), s.home).status).toBe(64);
  expect(run(compileArgs(s, ['--loss-policy', join(s.base, 'missing.json')]), s.home).status).toBe(64);
});

test('loss policy input is bounded by bytes and registered property count', () => {
  const s = scene();
  const policy = policyFile(s, ['tessera_notes', 'tessera_notes']);
  const repeated = run(compileArgs(s, ['--loss-policy', policy]), s.home);
  expect(repeated.status).toBe(64);
  expect(repeated.stderr).toContain('registered properties');

  writeFileSync(policy, JSON.stringify({ policy: 1, allow: ['tessera_notes'] }) + ' '.repeat(65_536));
  const oversized = run(compileArgs(s, ['--loss-policy', policy]), s.home);
  expect(oversized.status).toBe(64);
  expect(oversized.stderr).toContain('65536 bytes');
  expect(existsSync(s.out)).toBe(false);
});

// The check command.
function treeOf(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => `${join(entry.parentPath, entry.name)} ${readFileSync(join(entry.parentPath, entry.name)).length}`)
    .sort();
}

test('check on a clean project reports the loss and the digest, exits 0 and writes nothing', () => {
  const s = scene();
  const before = treeOf(s.base);
  const result = run(['check', '--repository', s.repository.directory, '--project-folder', PROJECT_FOLDER], s.home);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Loss: 3 values are dropped');
  expect(result.stdout).toContain('Nothing was written');
  expect(treeOf(s.base)).toEqual(before);
  expect(existsSync(s.out)).toBe(false);
});

test('check on a broken project lists the finding with its place and exits 1', () => {
  const s = scene();
  s.repository.commitFile(`${PROJECT_FOLDER}/ontology.yaml`, ONTOLOGY_TEXT.replace('tessera_notes: Ask finance', 'tessera_note: Ask finance'));
  const result = run(['check', '--repository', s.repository.directory, '--project-folder', PROJECT_FOLDER], s.home);
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('tessera-property');
  expect(result.stdout).toContain('/ontology/0/tessera_note');
  expect(result.stdout).toMatch(/line \d+, column \d+/);
});

test('check --files reads the folder as it is on disk and labels the result unpublished', () => {
  const s = scene();
  const folder = join(s.base, 'folder');
  mkdirSync(folder);
  writeFileSync(join(folder, 'ontology.yaml'), ONTOLOGY_TEXT + '# edited and never committed\n');
  const before = treeOf(s.base);
  const result = run(['check', '--files', folder, '--json'], s.home);
  expect(result.status).toBe(0);
  const output = JSON.parse(result.stdout);
  expect(output.source).toEqual({ kind: 'files-on-disk', unpublished: true });
  expect(output.report.losses).toHaveLength(3);
  expect(output.bundle).toBeNull();
  expect(treeOf(s.base)).toEqual(before);
  expect(run(['check', '--files', folder], s.home).stdout).toContain('files on disk (unpublished)');
});

test('check never needs acceptance, with or without a loss', () => {
  const s = scene();
  expect(run(['check', '--repository', s.repository.directory, '--project-folder', PROJECT_FOLDER, '--json'], s.home).status).toBe(0);
});

// Refusals at compile time: each exits 1 and writes nothing.
function expectRefused(s: Scene, args: string[], message: string) {
  const result = run(args, s.home);
  expect(result.status, result.stdout + result.stderr).toBe(1);
  expect(result.stdout).toContain(message);
  expect(existsSync(s.out)).toBe(false);
}

function dataRootPointingAt(s: Scene, commit: string): string {
  const root = join(s.base, 'data');
  mkdirSync(join(root, 'state'), { recursive: true });
  mkdirSync(join(root, 'projects'), { recursive: true });
  writeFileSync(join(root, 'state', 'published.json'), JSON.stringify({ formatVersion: 1, repositories: { repository: { branch: 'main', commit } } }));
  return root;
}

test('a commit that is not on the default branch history is refused', () => {
  const s = scene();
  const offBranch = s.repository.addPersonalBranch('personal/someone');
  expectRefused(s, compileArgs(s, ['--commit', offBranch]), 'not on the history');
});

test('a publication record cannot label an unrelated repository with the same directory name', () => {
  const s = scene();
  const root = dataRootPointingAt(s, s.repository.firstCommit);
  s.repository.addSecondCommit();
  expectRefused(s, compileArgs(s, ['--data-root', root]), 'outside');
});

test('an existing output folder that is not empty is refused', () => {
  const s = scene();
  mkdirSync(s.out);
  writeFileSync(join(s.out, 'keep.txt'), 'keep');
  const result = run(compileArgs(s, ['--accept-loss', `sha256:${'a'.repeat(64)}`]), s.home);
  expect(result.status).toBe(1);
  expect(readdirSync(s.out)).toEqual(['keep.txt']);
});

test('an output folder inside the data root projects folder is refused', () => {
  const s = scene();
  const root = dataRootPointingAt(s, s.repository.firstCommit);
  const inside = join(root, 'projects', 'bundle');
  const result = run(['compile', '--repository', s.repository.directory, '--project-folder', PROJECT_FOLDER, '--data-root', root, '--out', inside], s.home);
  expect(result.status).toBe(1);
  expect(existsSync(inside)).toBe(false);
});

test('two files whose output paths differ only in case are refused', () => {
  const s = scene();
  s.repository.commitFile(`${PROJECT_FOLDER}/Mapping.yaml`, COMMITTED_FILES[`${PROJECT_FOLDER}/mapping.yaml`]);
  const result = run([...compileArgs(s, ['--accept-loss', digestOf(s)])], s.home);
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('path-collision');
  expect(existsSync(s.out)).toBe(false);
});

test('a document of 2,000,001 bytes is refused', () => {
  const s = scene();
  s.repository.commitFile(`${PROJECT_FOLDER}/big.yaml`, 'x'.repeat(2_000_001));
  expectRefused(s, compileArgs(s), 'limit');
});

test('an invalid standard file refuses the whole compile', () => {
  const s = scene();
  s.repository.commitFile(`${PROJECT_FOLDER}/broken.yaml`, 'version: 0.2.0.dev0\nname: broken\ndatasets: []\n');
  expectRefused(s, compileArgs(s), 'compile failed');
});

test('a Tessera document that names an unsupported Ossie base is refused', () => {
  const s = scene();
  s.repository.commitFile(`${PROJECT_FOLDER}/ontology.yaml`, ONTOLOGY_TEXT.replace('version: 0.2.0.dev0', 'version: 0.3.0'));
  const result = run(compileArgs(s, ['--json']), s.home);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).findings.map((finding: { code: string }) => finding.code)).toContain('tessera-base');
  expect(existsSync(s.out)).toBe(false);
});
