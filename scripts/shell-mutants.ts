/** Focused faults for cross-project trash visibility and catalog search feedback. */
import { mkdir, symlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/** Uses the asset runner's isolated presentation-case dispatch for shell components. */
export const shellMutants: [string, string, string, string][] = [
  ['fonts', 'src/app/projects/trash-sections.ts', "item.kind === 'file' && item.project !== selectedProject", "item.kind === 'file' && item.project === selectedProject"],
  ['fonts', 'src/app/workspace/CatalogView.tsx', 'entities.length === 0 && search', 'entities.length > 0 && search'],
];

/** Runs a shell component candidate without changing the working source. */
export async function runShellCase(root: string, temporary: string, file: string, source: string, index: string) {
  const folder = dirname(resolve(root, file));
  const rewritten = source
    .replace(/\bfrom\s*(['"])(\.[^'"]+)\1/g, (_match, quote, path) => `from ${quote}${resolve(folder, path)}${quote}`)
    .replace(/\bimport\s*(['"])(\.[^'"]+)\1/g, (_match, quote, path) => `import ${quote}${resolve(folder, path)}${quote}`);
  const target = resolve(temporary, `shell-${index}.tsx`);
  await Bun.write(target, rewritten);
  const child = Bun.spawn([process.execPath, resolve(root, 'scripts/shell-mutation-cases.ts'), target], { stdout: 'pipe', stderr: 'pipe' });
  const code = await child.exited;
  return { code, error: await new Response(child.stderr).text() };
}

if (import.meta.main) {
  const root = process.cwd();
  const temporary = '/tmp/sw-E-shell';
  await mkdir(temporary, { recursive: true });
  try {
    await symlink(resolve(root, 'node_modules'), resolve(temporary, 'node_modules'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  for (const [index, [, file, before, after]] of shellMutants.entries()) {
    const source = await Bun.file(file).text();
    if (!source.includes(before)) throw Error(`Missing shell mutation anchor: ${before}`);
    const baseline = await runShellCase(root, temporary, file, source, `baseline-${index}`);
    if (baseline.code !== 0) throw Error(baseline.error);
    const mutant = await runShellCase(root, temporary, file, source.replace(before, after), String(index));
    if (mutant.code === 0) throw Error(`Surviving shell mutation: ${file}`);
    console.log(`KILLED shell: ${file}`);
  }
  console.log('2 shell mutants killed; 2 baselines passed.');
}
