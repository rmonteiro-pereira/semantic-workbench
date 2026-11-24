import { cp, mkdtemp, rm, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { meshMutants, type MeshMutant } from './mesh-mutation-cases';

async function runTest(directory: string, test: string) {
  const child = Bun.spawnSync([process.execPath, 'test', `tests/mesh/${test}.test.ts`], {
    cwd: directory,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120_000,
  });
  return { code: child.exitCode, output: child.stdout.toString() + child.stderr.toString() };
}

async function kill(directory: string, mutant: MeshMutant) {
  const target = resolve(directory, mutant.source);
  const content = await Bun.file(target).text();
  if (content.split(mutant.before).length !== 2) throw new Error(`Expected one mutation anchor for ${mutant.name}.`);
  const original = await runTest(directory, mutant.test);
  if (original.code !== 0) throw new Error(`Baseline failed for ${mutant.name}:\n${original.output}`);
  try {
    await Bun.write(target, content.replace(mutant.before, mutant.after));
    const result = await runTest(directory, mutant.test);
    if (!result.code) throw new Error(`Surviving mutant: ${mutant.name}.`);
    if (!/expect\(received\)|Expected:/.test(result.output) || /Cannot find module|SyntaxError/.test(result.output)) {
      throw new Error(`Invalid mutant ${mutant.name}:\n${result.output}`);
    }
    console.log(`KILLED mesh: ${mutant.name}`);
  } finally {
    await Bun.write(target, content);
  }
}

/** Runs the mesh mutants in a disposable copy so they cannot affect the worktree or another proof. */
export async function killMeshMutants() {
  const directory = await mkdtemp(resolve(process.cwd(), '.mesh-mutations-'));
  try {
    for (const entry of ['src', 'tests', 'schemas', 'policies', 'package.json', 'tsconfig.json', 'scripts', 'docs']) {
      await cp(entry, resolve(directory, entry), { recursive: true });
    }
    await symlink(resolve('node_modules'), resolve(directory, 'node_modules'), 'dir');
    for (const mutant of meshMutants) await kill(directory, mutant);
    console.log(`${meshMutants.length}/${meshMutants.length} mesh mutants killed.`);
    return meshMutants.length;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  if (process.argv.includes('--list')) {
    for (const mutant of meshMutants) console.log(mutant.name);
  } else {
    await killMeshMutants();
  }
}
