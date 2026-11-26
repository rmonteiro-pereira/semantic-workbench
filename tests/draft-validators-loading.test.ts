// Checks the Ossie 0.3 draft validators load only for a file that declares the draft, and that a check before loading blocks instead of passing.
// Each case runs in a fresh process, because the loaded module is shared by everything in one process.
import { expect, test } from 'bun:test';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');

/** Runs a script in a fresh Bun process from the repository root and returns what it prints as JSON. */
function runFresh(script: string): any {
  const result = Bun.spawnSync([process.execPath, '-e', script], { cwd: ROOT });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return JSON.parse(result.stdout.toString());
}

test('preparing and validating every shipped 0.2 example never requests the draft module', () => {
  const outcome = runFresh(`
    import { Glob } from 'bun';
    import { readFileSync } from 'node:fs';
    import { draftLoadCount, prepareDraftChecks } from './src/shared/validation/draft-validators';
    import { validateInput } from './src/shared/validation/input';
    const paths = [...new Glob('public/examples/**/*.yaml').scanSync('.')];
    for (const path of paths) {
      const text = readFileSync(path, 'utf8');
      await prepareDraftChecks(text);
      validateInput(text, path);
    }
    console.log(JSON.stringify({ files: paths.length, loads: draftLoadCount() }));
  `);
  expect(outcome.files).toBeGreaterThan(10);
  expect(outcome.loads).toBe(0);
});

test('a 0.3 file checked before the draft module loads gets a blocking finding and is not valid', () => {
  const outcome = runFresh(`
    import { readFileSync } from 'node:fs';
    import { validateInput } from './src/shared/validation/input';
    const results = ['sales.semantic.yaml', 'sales.ontology.yaml', 'sales.mapping.yaml'].map(name => {
      const result = validateInput(readFileSync('tests/fixtures/ossie-0.3/' + name, 'utf8'), name);
      return { valid: result.valid, codes: result.issues.map(issue => issue.code) };
    });
    console.log(JSON.stringify(results));
  `);
  for (const result of outcome) expect(result).toEqual({ valid: false, codes: ['draft-checks-loading'] });
});

test('preparing a 0.3 file first loads the module once, and its check never shows the loading finding', () => {
  const outcome = runFresh(`
    import { readFileSync } from 'node:fs';
    import { draftLoadCount, prepareDraftChecks } from './src/shared/validation/draft-validators';
    import { validateInput } from './src/shared/validation/input';
    const codes = [];
    for (const name of ['sales.semantic.yaml', 'sales.ontology.yaml', 'sales.mapping.yaml']) {
      const text = readFileSync('tests/fixtures/ossie-0.3/' + name, 'utf8');
      await prepareDraftChecks(text);
      codes.push(...validateInput(text, name).issues.map(issue => issue.code));
    }
    console.log(JSON.stringify({ codes, loads: draftLoadCount() }));
  `);
  expect(outcome).toEqual({ codes: [], loads: 1 });
});
