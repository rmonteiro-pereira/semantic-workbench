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

test('an imported 0.3 file shows no loading finding, and importing a 0.2 file never requests the draft module', () => {
  const outcome = runFresh(`
    import { readFileSync } from 'node:fs';
    import { draftLoadCount } from './src/shared/validation/draft-validators';
    import { validateInput } from './src/shared/validation/input';
    import { readImportDrafts } from './src/app/workspace/hooks/useImport';
    const oldDrafts = await readImportDrafts([new File([readFileSync('public/examples/billing/billing.semantic.yaml', 'utf8')], 'billing.semantic.yaml')]);
    const loadsAfterOld = draftLoadCount();
    const drafts = await readImportDrafts([new File([readFileSync('tests/fixtures/ossie-0.3/sales.semantic.yaml', 'utf8')], 'sales.semantic.yaml')]);
    const codes = drafts.flatMap(draft => validateInput(draft.source, draft.filename).issues.map(issue => issue.code));
    console.log(JSON.stringify({ oldValid: validateInput(oldDrafts[0].source, oldDrafts[0].filename).valid, loadsAfterOld, codes }));
  `);
  expect(outcome).toEqual({ oldValid: true, loadsAfterOld: 0, codes: [] });
});

test('a 0.3 file the workspace receives from the server is checked without the loading finding', () => {
  const outcome = runFresh(`
    import { readFileSync } from 'node:fs';
    import { draftLoadCount } from './src/shared/validation/draft-validators';
    import { validateInput } from './src/shared/validation/input';
    import { api } from './src/app/projects/api';
    const answer = path => ({ path, source: readFileSync(path, 'utf8'), hash: 'h', docType: 'ossie' });
    globalThis.fetch = async url => Response.json(answer(String(url).includes('sales') ? 'tests/fixtures/ossie-0.3/sales.semantic.yaml' : 'public/examples/billing/billing.semantic.yaml'));
    const old = await api.file('demo', 'billing.semantic.yaml');
    const loadsAfterOld = draftLoadCount();
    const file = await api.file('demo', 'sales.semantic.yaml');
    const codes = validateInput(file.source, 'sales.semantic.yaml').issues.map(issue => issue.code);
    console.log(JSON.stringify({ oldValid: validateInput(old.source, 'billing.semantic.yaml').valid, loadsAfterOld, codes }));
  `);
  expect(outcome).toEqual({ oldValid: true, loadsAfterOld: 0, codes: [] });
});

test('a failed load of the draft module is retried by the next request instead of failing for good', () => {
  const outcome = runFresh(`
    import { readFileSync } from 'node:fs';
    import { draftLoadCount, loadDraftValidators } from './src/shared/validation/draft-validators';
    import { validateInput } from './src/shared/validation/input';
    const failed = await loadDraftValidators(() => Promise.reject(new Error('offline'))).then(() => 'loaded', error => error.message);
    await loadDraftValidators();
    const codes = validateInput(readFileSync('tests/fixtures/ossie-0.3/sales.semantic.yaml', 'utf8'), 'sales.semantic.yaml').issues.map(issue => issue.code);
    console.log(JSON.stringify({ failed, loads: draftLoadCount(), codes }));
  `);
  expect(outcome).toEqual({ failed: 'offline', loads: 2, codes: [] });
});

test('a 0.3 file still opens when the draft module cannot load, and its check is blocked by the loading finding', () => {
  const outcome = runFresh(`
    import { readFileSync } from 'node:fs';
    import { loadDraftValidators } from './src/shared/validation/draft-validators';
    import { validateInput } from './src/shared/validation/input';
    import { api } from './src/app/projects/api';
    const path = 'tests/fixtures/ossie-0.3/sales.semantic.yaml';
    globalThis.fetch = async () => Response.json({ path, source: readFileSync(path, 'utf8'), hash: 'h', docType: 'ossie' });
    // The load fails while the file is being opened, so opening joins the failing load.
    const failing = loadDraftValidators(() => new Promise((_, reject) => setTimeout(() => reject(new Error('offline')), 50))).catch(() => undefined);
    const file = await api.file('demo', 'sales.semantic.yaml');
    await failing;
    const result = validateInput(file.source, 'sales.semantic.yaml');
    console.log(JSON.stringify({ opened: file.path, valid: result.valid, codes: result.issues.map(issue => issue.code) }));
  `);
  expect(outcome).toEqual({ opened: 'tests/fixtures/ossie-0.3/sales.semantic.yaml', valid: false, codes: ['draft-checks-loading'] });
});

test('a lint request whose draft load fails is answered with its id and the loading finding, and the next request loads', () => {
  const outcome = runFresh(`
    import { readFileSync } from 'node:fs';
    import { loadDraftValidators } from './src/shared/validation/draft-validators';
    import { lintReply } from './src/app/editor/lintRequest';
    const source = readFileSync('tests/fixtures/ossie-0.3/sales.semantic.yaml', 'utf8');
    const failingLoad = () => loadDraftValidators(() => Promise.reject(new Error('offline'))).then(() => undefined);
    const first = await lintReply({ id: 1, source, filename: 'sales.semantic.yaml' }, failingLoad);
    const second = await lintReply({ id: 2, source, filename: 'sales.semantic.yaml' });
    const codes = reply => reply.issues.filter(issue => issue.severity === 'error').map(issue => issue.code);
    console.log(JSON.stringify({ first: { id: first.id, codes: codes(first) }, second: { id: second.id, codes: codes(second) } }));
  `);
  expect(outcome).toEqual({ first: { id: 1, codes: ['draft-checks-loading'] }, second: { id: 2, codes: [] } });
});
