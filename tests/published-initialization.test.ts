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
  const result = Bun.spawnSync(['git', '--no-optional-locks', ...args], { cwd, env: process.env });
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
      expect(ws.state.view('definitions').publicationNotice).toBe(true);
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
      expect(ws.state.view('definitions').publicationNotice).toBeUndefined();
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

test('a detached local checkout adopts an existing main without moving HEAD', async () => {
  const fixture = preChangeRoot();
  try {
    git(fixture.repository, ['checkout', '--detach']);
    const head = readFileSync(join(fixture.repository, '.git', 'HEAD'));
    const ws = await openWorkspace({ root: fixture.dir });
    try {
      expect(ws.state.published().repositories.definitions.commit).toBe(fixture.published!);
      expect(ws.documents()).toHaveLength(1);
      expect(readFileSync(join(fixture.repository, '.git', 'HEAD'))).toEqual(head);
    } finally {
      ws.close();
    }
  } finally {
    fixture.dispose();
  }
});

test('a locally upgraded root refuses server startup before touching dirty staged or unstaged work', async () => {
  const fixture = preChangeRoot();
  try {
    const local = await openWorkspace({ root: fixture.dir });
    local.close();
    const path = join(fixture.repository, 'shop.ontology.yaml');
    writeFileSync(path, 'name: Staged\nontology: [{concept: Staged}]\n');
    git(fixture.repository, ['add', '--', 'shop.ontology.yaml']);
    writeFileSync(path, 'name: Unstaged\nontology: [{concept: Unstaged}]\n');
    const index = readFileSync(join(fixture.repository, '.git', 'index'));
    const head = readFileSync(join(fixture.repository, '.git', 'HEAD'));
    const refs = git(fixture.repository, ['show-ref']);
    await expect(openWorkspace({ root: fixture.dir, reconcilePublished: true })).rejects.toThrow('has changes');
    expect(readFileSync(join(fixture.repository, '.git', 'index'))).toEqual(index);
    expect(readFileSync(join(fixture.repository, '.git', 'HEAD'))).toEqual(head);
    expect(git(fixture.repository, ['show-ref'])).toBe(refs);
    expect(readFileSync(path, 'utf8')).toContain('Unstaged');
  } finally {
    fixture.dispose();
  }
});

test('taking a pin never reads the registry from disk', async () => {
  const fixture = preChangeRoot();
  const ws = await openWorkspace({ root: fixture.dir });
  try {
    ws.state.registry = () => {
      throw Error('Unexpected registry I/O');
    };
    expect(ws.published.pin().commits.get('definitions')?.commit).toBe(fixture.published!);
  } finally {
    ws.close();
    fixture.dispose();
  }
});

for (const known of [true, false]) {
  test(`upgrade on feature-x ${known ? 'adopts main' : 'asks for a default'} without publishing feature commits`, async () => {
    const fixture = preChangeRoot();
    try {
      git(fixture.repository, ['checkout', '-b', 'feature-x', 'work/local']);
      if (!known) git(fixture.repository, ['branch', '-D', 'main']);
      const refs = git(fixture.repository, ['show-ref']);
      const ws = await openWorkspace({ root: fixture.dir });
      try {
        expect(ws.state.published().repositories.definitions?.commit).toBe(known ? fixture.published! : undefined);
        expect(ws.state.view('definitions').publicationNotice).toBe(true);
        expect(git(fixture.repository, ['branch', '--show-current'])).toBe('feature-x');
        expect(git(fixture.repository, ['show-ref'])).toBe(refs);
        if (known) {
          expect(await ws.git.configValue(fixture.repository, 'workbench.defaultBranch', 'local')).toBe('main');
          expect(git(fixture.repository, ['branch', '--show-current'])).toBe('feature-x');
          expect(ws.state.published().repositories.definitions.commit).toBe(fixture.published!);
        }
      } finally {
        ws.close();
      }
    } finally {
      fixture.dispose();
    }
  });
}

test('registering projects in an already seen repository does not retry initial adoption', async () => {
  const fixture = preChangeRoot();
  try {
    git(fixture.repository, ['checkout', '-b', 'feature-x', 'work/local']);
    git(fixture.repository, ['branch', '-D', 'main']);
    const ws = await openWorkspace({ root: fixture.dir });
    try {
      git(fixture.repository, ['config', '--local', 'workbench.defaultBranch', 'feature-x']);
      await ws.registerRepositoryProjects('definitions', [{ path: '', name: 'Definitions' }]);
      expect(ws.state.published().repositories).toEqual({});
      expect(git(fixture.repository, ['branch', '--show-current'])).toBe('feature-x');
    } finally {
      ws.close();
    }
  } finally {
    fixture.dispose();
  }
});
