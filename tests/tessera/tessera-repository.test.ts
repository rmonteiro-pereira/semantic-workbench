// Checks the temporary repository holds exactly the committed bytes and differs from them in the working tree.
import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateInput } from '../../src/shared/validation/input';
import { COMMITTED_FILES, ONTOLOGY_TEXT, PROJECT_FOLDER, createTesseraRepository, type TesseraRepository } from '../helpers/tessera-repository';

let repository: TesseraRepository | undefined;
afterEach(() => repository?.dispose());

function show(directory: string, spec: string): string {
  const result = Bun.spawnSync(['git', 'show', spec], { cwd: directory });
  return result.stdout.toString();
}

test('the first commit holds exactly the committed files and not the ignored one', () => {
  repository = createTesseraRepository();
  const listed = Bun.spawnSync(['git', 'ls-tree', '-r', '--name-only', repository.firstCommit], { cwd: repository.directory }).stdout.toString().trim().split('\n');
  expect(listed.sort()).toEqual(Object.keys(COMMITTED_FILES).sort());
  for (const [path, text] of Object.entries(COMMITTED_FILES)) expect(show(repository.directory, `${repository.firstCommit}:${path}`)).toBe(text);
});

test('an uncommitted edit changes the working tree and leaves the commit alone', () => {
  repository = createTesseraRepository();
  const path = `${PROJECT_FOLDER}/ontology.yaml`;
  repository.editWithoutCommit(path, ONTOLOGY_TEXT + '# local edit\n');
  expect(readFileSync(join(repository.directory, path), 'utf8')).toContain('local edit');
  expect(show(repository.directory, `${repository.firstCommit}:${path}`)).toBe(ONTOLOGY_TEXT);
});

test('a personal branch and a second commit give other identifiers and leave main at the right place', () => {
  repository = createTesseraRepository();
  const branchCommit = repository.addPersonalBranch('personal/rodrigo');
  const secondCommit = repository.addSecondCommit();
  expect(new Set([repository.firstCommit, branchCommit, secondCommit]).size).toBe(3);
  const mainTip = Bun.spawnSync(['git', 'rev-parse', 'main'], { cwd: repository.directory }).stdout.toString().trim();
  expect(mainTip).toBe(secondCommit);
  expect(show(repository.directory, `${branchCommit}:${PROJECT_FOLDER}/ontology.yaml`)).toContain('personal branch');
});

test('every standard document of the project passes the standard validator', () => {
  for (const name of ['semantic-model.yaml', 'mapping.yaml', 'contract.odcs.yaml']) {
    const result = validateInput(COMMITTED_FILES[`${PROJECT_FOLDER}/${name}`], name);
    expect(result.valid).toBe(true);
    expect(result.issues.filter(issue => issue.severity !== 'info')).toEqual([]);
  }
});
