// Starts from copied pre-snapshot roots and proves adoption preserves refs, files and staged bytes.
import { expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openWorkspace } from '../src/server/projects/workspace';
import { createState } from '../src/server/projects/state';
import { dataLayout } from '../src/server/projects/paths';
import { publicationRepository } from './helpers/git-fixtures';

function preChangeRoot(kind: 'history' | 'unborn' = 'history') {
  const fixture = publicationRepository(kind);
  const layout = dataLayout(fixture.dir);
  createState(layout).writeRegistry([{ slug: 'definitions', name: 'Definitions', createdAt: '', origin: '' }]);
  return fixture;
}
function git(cwd: string, args: string[]) {
  const result = Bun.spawnSync(['git', '--no-optional-locks', ...args], { cwd });
  if (result.exitCode) throw Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

test('local upgrade adopts the old default tip from a copy without losing staged, unstaged or untracked work', async () => {
  const fixture = preChangeRoot();
  const copy = mkdtempSync('/tmp/sw-008/upgrade-');
  try {
    const path = join(fixture.repository, 'shop.ontology.yaml');
    writeFileSync(path, 'name: Staged\nontology: [{concept: Staged}]\n');
    git(fixture.repository, ['add', '--', 'shop.ontology.yaml']);
    writeFileSync(path, 'name: Unstaged\nontology: [{concept: Unstaged}]\n');
    writeFileSync(join(fixture.repository, 'untracked.yaml'), 'name: Untracked\nontology: []\n');
    cpSync(fixture.dir, copy, { recursive: true });
    const repository = join(copy, 'projects', 'definitions');
    const refs = git(repository, ['show-ref']);
    const index = readFileSync(join(repository, '.git', 'index'));
    const head = readFileSync(join(repository, '.git', 'HEAD'));
    const ws = await openWorkspace({ root: copy });
    try {
      expect(ws.state.published().repositories.definitions.commit).toBe(fixture.published!);
      expect(ws.state.view('definitions').files['@publication']).toEqual({ notice: true, branch: 'main', commit: fixture.published! });
      expect((await ws.published.documents(ws.published.pin(), 'definitions'))[0].source).toContain('Published');
      expect(readFileSync(join(repository, 'shop.ontology.yaml'), 'utf8')).toContain('Unstaged');
      expect(git(repository, ['show', ':shop.ontology.yaml'])).toContain('Staged');
      expect(git(repository, ['show-ref'])).toBe(refs);
      expect(readFileSync(join(repository, '.git', 'index'))).toEqual(index);
      expect(readFileSync(join(repository, '.git', 'HEAD'))).toEqual(head);
      expect(readFileSync(join(repository, 'untracked.yaml'), 'utf8')).toContain('Untracked');
    } finally {
      ws.close();
    }
    const pointers = readFileSync(join(copy, 'state', 'published.json'));
    const restarted = await openWorkspace({ root: copy });
    try {
      expect(readFileSync(join(copy, 'state', 'published.json'))).toEqual(pointers);
      expect(git(repository, ['show-ref'])).toBe(refs);
      expect(readFileSync(join(repository, '.git', 'index'))).toEqual(index);
      expect(readFileSync(join(repository, '.git', 'HEAD'))).toEqual(head);
      expect(readFileSync(join(repository, 'shop.ontology.yaml'), 'utf8')).toContain('Unstaged');
    } finally {
      restarted.close();
    }
  } finally {
    fixture.dispose();
    rmSync(copy, { recursive: true, force: true });
  }
});

test('server startup records a clean default tip without changing document sources', async () => {
  const fixture = preChangeRoot();
  try {
    const before = readFileSync(join(fixture.repository, 'shop.ontology.yaml'), 'utf8');
    const ws = await openWorkspace({ root: fixture.dir, reconcilePublished: true });
    try {
      expect((await ws.published.documents(ws.published.pin(), 'definitions'))[0].source).toBe(before);
      expect(ws.documents()[0].source).toBe(before);
      expect(ws.state.view('definitions').files['@publication']).toBeUndefined();
    } finally {
      ws.close();
    }
  } finally {
    fixture.dispose();
  }
});

test('an unborn default branch records no pointer even with an authoring commit', async () => {
  const fixture = preChangeRoot('unborn');
  try {
    git(fixture.repository, ['config', '--local', 'workbench.defaultBranch', 'main']);
    const ws = await openWorkspace({ root: fixture.dir });
    try {
      expect(ws.state.published().repositories).toEqual({});
    } finally {
      ws.close();
    }
  } finally {
    fixture.dispose();
  }
});
