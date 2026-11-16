/** Detects faults in staged-deletion wording and the comparison existence guard. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const sourcePath = 'src/app/scm/diff-presentation.ts';
const faults = [
  ["destination === 'index'", 'false'],
  ['beforeExists && afterExists && before === after', 'before === after'],
  ['beforeExists && afterExists && before === after', 'beforeExists && before === after'],
  ['beforeExists && afterExists && before === after', 'afterExists && before === after'],
];

/** Runs a passing baseline and requires each comparison fault to fail in a temporary module. */
export async function runScmMutants(root: string, temporary: string) {
  const source = await Bun.file(resolve(root, sourcePath)).text();
  const baseline = resolve(temporary, 'scm-baseline.ts');
  await Bun.write(baseline, source);
  assert.equal(await runCase(root, baseline), 0, 'comparison baseline must pass');
  for (const [index, [needle, replacement]] of faults.entries()) {
    assert.ok(source.includes(needle), `comparison mutation anchor ${index}`);
    const target = resolve(temporary, `scm-fault-${index}.ts`);
    await Bun.write(target, source.replace(needle, replacement));
    assert.notEqual(await runCase(root, target), 0, `comparison fault ${index} survived`);
  }
  console.log(`${faults.length} SCM presentation mutants detected; baseline passed`);
}

async function runCase(root: string, target: string) {
  const child = Bun.spawn([process.execPath, resolve(root, 'scripts/scm-mutation-cases.ts'), target], { stdout: 'ignore', stderr: 'ignore' });
  return child.exited;
}
