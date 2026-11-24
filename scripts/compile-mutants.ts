// Deliberate faults in the compile decisions: acceptance, published-only reading, unit completeness, conversion preconditions and part paging. Each must make a focused case in scripts/compile-mutation-cases.ts fail.
// Run `bun scripts/compile-mutants.ts` to check these faults alone; the full mutation gate runs them with every other category.
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

/** One fault: its category, the file, the exact text to replace and the faulty text. */
type Mutant = [category: string, file: string, before: string, after: string];

const acceptLoss = 'src/server/tessera/accept-loss.ts';
const outputPart = 'src/server/tessera/output-part.ts';
const unitSource = 'src/server/tessera/unit-source.ts';
const compileService = 'src/server/tessera/compile-service.ts';
const convertService = 'src/server/tessera/convert-service.ts';
const workspaceUnitSource = 'src/server/tessera/workspace-unit-source.ts';

/** The faults of the compile operations. */
export const compileMutants: Mutant[] = [
  ['compile', acceptLoss, "if (failures.length) return { decision: 'refused' };", ''],
  ['compile', acceptLoss, "return { decision: 'accepted', accepted: outcome.accepted };", "return { decision: 'accepted', accepted: 'none' };"],
  ['compile', outputPart, 'if (request.commit !== source.commit)', 'if (false)'],
  ['compile', outputPart, 'if (request.commit === undefined)', 'if (false)'],
  ['compile', outputPart, 'while (boundary > 0 && boundary < bytes.length && isContinuationByte(bytes[boundary]))', 'while (false)'],
  ['compile', outputPart, 'const nextOffset = end < bytes.length ? end : null;', 'const nextOffset = null;'],
  ['compile', outputPart, 'if (request.offset < bytes.length && isContinuationByte(bytes[request.offset]))', 'if (false)'],
  ['compile', unitSource, 'if (restricted > 0) throw new HiddenResourceError();', ''],
  ['compile', unitSource, 'if (bytes === null) throw new HiddenResourceError();', ''],
  ['compile', unitSource, "return { read: kind => (kind === 'published' ? readPublished() : readWorking()) };", 'return { read: () => readWorking() };'],
  ['compile', unitSource, 'if (listed.length > limits.projectFiles) throw new UnitLimitError(', 'if (false) throw new UnitLimitError('],
  ['compile', unitSource, 'if (oversized) throw new UnitLimitError(', 'if (false) throw new UnitLimitError('],
  ['compile', compileService, "const read = await units.read('published');", "const read = await units.read('working');"],
  ['compile', compileService, 'if (request.commit !== undefined && request.commit !== read.commit) throw', 'if (false) throw'],
  ['compile', compileService, '{ commit, offset: file.offset }', '{ commit: outcome.commit, offset: file.offset }'],
  ['compile', convertService, 'if (current.hash !== request.baseHash) throw', 'if (false) throw'],
  ['compile', convertService, "if (state === 'changed') throw", 'if (false) throw'],
  ['compile', convertService, "if (state === 'no-history') throw", 'if (false) throw'],
  ['compile', convertService, 'if (!sameInputs(compile, request.inputs)) throw', 'if (false) throw'],
  ['compile', convertService, "if (decision.decision !== 'accepted') throw", 'if (false) throw'],
  ['compile', convertService, "if (classifyFile({ path, bytes }).kind !== 'tessera-ontology') throw", 'if (false) throw'],
  ['compile', convertService, 'if (compile.failures.length) throw', 'if (false) throw'],
  ['compile', workspaceUnitSource, 'canRead: path => !reader.view || reader.view.canRead(slug, path),', 'canRead: () => true,'],
];

/** Writes one faulty copy of a module with its relative imports pointing back at the real sources, then runs the focused cases against it. */
async function runMutant(temp: string, index: number, [category, file, before, after]: Mutant): Promise<{ code: number; error: string }> {
  const root = process.cwd();
  const source = await Bun.file(file).text();
  if (!source.includes(before)) throw new Error(`Mutation anchor missing in ${file}: ${before}`);
  const absolute = (path: string) => resolve(dirname(resolve(root, file)), path);
  const rewritten = source
    .replaceAll(before, after)
    .replace(/\bfrom\s*(['"])(\.[^'"]+)\1/g, (_all, quote, path) => `from ${quote}${absolute(path)}${quote}`)
    .replace(/\bimport\(\s*(['"])(\.[^'"]+)\1\s*\)/g, (_all, quote, path) => `import(${quote}${absolute(path)}${quote})`);
  const target = resolve(temp, `mutant-${index}.ts`);
  await Bun.write(target, rewritten);
  const child = Bun.spawn([process.execPath, resolve(root, 'scripts/mutation-case.ts'), target, category], { stdout: 'pipe', stderr: 'pipe' });
  const timer = setTimeout(() => child.kill(), 120_000);
  const code = await child.exited;
  clearTimeout(timer);
  return { code, error: await new Response(child.stderr).text() };
}

/** Runs every compile mutant alone and fails when one survives or cannot be loaded. */
export async function killCompileMutants(): Promise<number> {
  const temp = await mkdtemp(resolve(tmpdir(), 'workbench-compile-mutations-'));
  await symlink(resolve(process.cwd(), 'node_modules'), resolve(temp, 'node_modules'), 'dir');
  let killed = 0;
  try {
    // Each module must pass the cases unchanged, or a surviving fault would mean nothing.
    for (const file of new Set(compileMutants.map(mutant => mutant[1]))) {
      const first = compileMutants.find(mutant => mutant[1] === file)!;
      const baseline = await runMutant(temp, -1, [first[0], file, first[2], first[2]]);
      if (baseline.code !== 0) throw new Error(`Baseline failed for ${file}: ${baseline.error}`);
    }
    for (const [index, mutant] of compileMutants.entries()) {
      const result = await runMutant(temp, index, mutant);
      if (result.code === 0) throw new Error(`Surviving mutant ${index} in ${mutant[1]}: ${mutant[2]} -> ${mutant[3]}`);
      if (/Cannot find|SyntaxError|ModuleNotFound/.test(result.error)) throw new Error(`Invalid mutation ${index}: ${result.error}`);
      killed += 1;
      console.log(`KILLED compile: ${mutant[2]} -> ${mutant[3]}`);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
  console.log(`${killed}/${compileMutants.length} compile mutants killed.`);
  return killed;
}

if (import.meta.main) await killCompileMutants();
