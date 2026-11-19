// Regenerates the command line's bundle for the fixture project and compares it with the recorded golden files. Run with UPDATE_GOLDEN=1 to record them again.
import { expect, test } from 'bun:test';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { COMPILE_PROJECT, compileWithCommandLine, compileWorkspace, digestFromCommandLine } from '../helpers/compile-workspace';

const GOLDEN = 'tests/fixtures/compile/golden';
const COMMIT_PLACEHOLDER = '<commit>';

/** The commit differs on every run, so the recorded manifest holds a placeholder in its place. */
function withoutCommit(path: string, bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes);
  if (path !== 'manifest.json') return text;
  return text.replace(/"commit": "[0-9a-f]{40,64}"/, `"commit": "${COMMIT_PLACEHOLDER}"`);
}

function recordedFiles(folder: string, prefix = '', found = new Map<string, string>()) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) recordedFiles(join(folder, entry.name), path, found);
    else found.set(path, readFileSync(join(folder, entry.name), 'utf8'));
  }
  return found;
}

test('the command line bundle of the fixture equals the recorded golden files', async () => {
  using workspace = await compileWorkspace();
  const digest = digestFromCommandLine(workspace, COMPILE_PROJECT);
  const bundle = compileWithCommandLine(workspace, COMPILE_PROJECT, { acceptLoss: digest });
  expect(bundle.status).toBe(0);
  const actual = new Map([...bundle.files].map(([path, bytes]) => [path, withoutCommit(path, bytes)]));
  if (process.env.UPDATE_GOLDEN === '1') {
    rmSync(GOLDEN, { recursive: true, force: true });
    for (const [path, text] of actual) {
      mkdirSync(dirname(join(GOLDEN, path)), { recursive: true });
      writeFileSync(join(GOLDEN, path), text);
    }
  }
  const golden = recordedFiles(GOLDEN);
  expect([...actual.keys()].sort()).toEqual([...golden.keys()].sort());
  for (const [path, text] of actual) expect(text, path).toBe(golden.get(path)!);
}, 60000);

test('the golden compile drops exactly the notes of the fixture ontology', () => {
  const report = JSON.parse(readFileSync(join(GOLDEN, 'loss-report.json'), 'utf8'));
  expect(report.counts).toEqual({ tessera_notes: 3 });
  expect(report.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
});
