// Tests several projects in one Git repository: registration from a manifest or a confirmed
// choice, shared Source Control, rescans, and the two ways to take a subproject away.
import { test, expect } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { testWorkspace } from './helpers/temp-data-dir';
import { call, ok, sh } from './helpers/scm';
import { MANIFEST, bareRepository, ontologyText } from './helpers/git-fixtures';

type Workspace = Awaited<ReturnType<typeof testWorkspace>>;

const SALES_FILE = 'sales.ontology.yaml';
const FINANCE_FILE = 'finance.ontology.yaml';
const FINANCE_TEXT = ontologyText('Finance', ['Invoice', 'Payment']);
const SALES_TEXT = ontologyText('Sales', ['Customer', 'Order']);

// Starts a clone and waits for its last event.
async function cloned(app: Workspace, url: string) {
  const started = await ok(call(app, 'POST', '/api/clone', { url }));
  for (let tries = 0; tries < 400; tries++) {
    const done = app.ws.events
      .replay(0)!
      .filter(event => event.event === 'clone')
      .map(event => event.data as any)
      .find(data => data.op === started.op && ['done', 'failed'].includes(data.phase));
    if (done) return done;
    await Bun.sleep(25);
  }
  throw Error('The clone did not finish.');
}

const byName = (app: Workspace) => new Map(app.ws.state.registry().projects.map(project => [project.name, project]));

// A workspace holding a clone of the team repository whose manifest declares Sales and Finance.
async function teamWorkspace(options: { watch?: boolean } = {}) {
  const source = bareRepository('monorepo');
  const app = await testWorkspace({ ...options, debounceMs: 50 });
  const done = await cloned(app, source.bare);
  const projects = byName(app);
  const repo = join(app.root, 'projects', 'monorepo');
  return {
    app,
    done,
    repo,
    sales: projects.get('Sales')!.slug,
    finance: projects.get('Finance')!.slug,
    write: (path: string, text: string) => writeFileSync(join(repo, path), text),
    porcelain: () => sh(repo, ['status', '--porcelain']).trim(),
    dispose: () => {
      app.dispose();
      source.dispose();
    },
  };
}

test('a manifest makes each declared folder a project of the shared repository', async () => {
  const team = await teamWorkspace();
  try {
    expect(team.done).toMatchObject({ phase: 'done', manifest: { projects: MANIFEST.projects } });
    const projects = team.app.ws.state.registry().projects;
    expect(projects.map(project => [project.name, project.folder, project.repo])).toEqual([
      ['Sales', 'monorepo/domains/sales', 'monorepo'],
      ['Finance', 'monorepo/domains/finance', 'monorepo'],
    ]);
    const listed = await ok(call(team.app, 'GET', '/api/projects'));
    const files = listed.map((project: any) => project.files.map((file: any) => file.path));
    expect(files.sort()).toEqual([[FINANCE_FILE], [SALES_FILE]]);
    expect(team.app.ws.readFile(team.finance, FINANCE_FILE).source).toBe(FINANCE_TEXT);
  } finally {
    team.dispose();
  }
});

test('both projects share one Source Control and each change names its project', async () => {
  const team = await teamWorkspace();
  try {
    team.write(`domains/finance/${FINANCE_FILE}`, ontologyText('Finance', ['Invoice']));
    team.write(`domains/sales/${SALES_FILE}`, ontologyText('Sales', ['Customer']));
    // Paths inside the viewing project are relative to it; the others keep repository paths.
    const changesSeenFrom = async (slug: string) => {
      const status = await ok(call(team.app, 'GET', `/api/projects/${slug}/git/status`));
      return status.changes.map((change: any) => [change.path, change.project, change.outside === true]).sort();
    };
    expect(await changesSeenFrom(team.sales)).toEqual([
      [`domains/finance/${FINANCE_FILE}`, team.finance, true],
      [SALES_FILE, team.sales, false],
    ]);
    expect(await changesSeenFrom(team.finance)).toEqual([
      [`domains/sales/${SALES_FILE}`, team.sales, true],
      [FINANCE_FILE, team.finance, false],
    ]);

    const before = team.app.ws.events.lastId;
    const base = `/api/projects/${team.sales}`;
    await ok(call(team.app, 'POST', base + '/git/stage', { all: true }));
    await ok(call(team.app, 'POST', base + '/git/commit', { message: 'Both' }));
    expect(team.porcelain()).toBe('');
    const gitEvents = team.app.ws.events
      .replay(before)!
      .filter(event => event.event === 'git')
      .map(event => event.data as any);
    expect(gitEvents.at(-1)).toMatchObject({ repo: 'monorepo' });
    expect([...gitEvents.at(-1).projects].sort()).toEqual([team.finance, team.sales].sort());
    const listed = await ok(call(team.app, 'GET', '/api/projects'));
    for (const project of listed) expect(project.files[0].gitState).toBe('clean');
  } finally {
    team.dispose();
  }
});

test('an outside edit in one subfolder refreshes only the project that owns it', async () => {
  const team = await teamWorkspace({ watch: true });
  try {
    const before = team.app.ws.events.lastId;
    team.write(`domains/finance/${FINANCE_FILE}`, ontologyText('Finance', ['Invoice']));
    let refreshed: any[] = [];
    for (let tries = 0; tries < 80 && !refreshed.length; tries++) {
      await Bun.sleep(25);
      refreshed = team.app.ws.events
        .replay(before)!
        .filter(event => event.event === 'files')
        .map(event => event.data);
    }
    expect(refreshed).toEqual([expect.objectContaining({ project: team.finance })]);
    expect(team.app.ws.cache.file(team.finance, FINANCE_FILE)!.gitState).toBe('modified');
    expect(team.app.ws.cache.file(team.sales, SALES_FILE)!.gitState).toBe('clean');
  } finally {
    team.dispose();
  }
});

test('a branch switch from one project changes the other project too', async () => {
  const team = await teamWorkspace();
  const yearly = ontologyText('Finance', ['Invoice', 'Payment', 'Refund']);
  try {
    const base = `/api/projects/${team.sales}`;
    await ok(call(team.app, 'POST', base + '/git/switch', { branch: 'review', create: true }));
    team.write(`domains/finance/${FINANCE_FILE}`, yearly);
    await ok(call(team.app, 'POST', base + '/git/stage', { all: true }));
    await ok(call(team.app, 'POST', base + '/git/commit', { message: 'Refunds' }));
    await ok(call(team.app, 'POST', base + '/git/switch', { branch: 'main' }));
    expect(team.app.ws.readFile(team.finance, FINANCE_FILE).source).toBe(FINANCE_TEXT);
    const financeBase = `/api/projects/${team.finance}`;
    await ok(call(team.app, 'POST', financeBase + '/git/switch', { branch: 'review' }));
    expect(team.app.ws.readFile(team.finance, FINANCE_FILE).source).toBe(yearly);
    const salesStatus = await ok(call(team.app, 'GET', base + '/git/status'));
    expect(salesStatus.branch).toBe('review');
  } finally {
    team.dispose();
  }
});

test('Remove from workspace unregisters a subproject and deletes nothing', async () => {
  const team = await teamWorkspace();
  try {
    const head = sh(team.repo, ['rev-parse', 'HEAD']);
    await ok(call(team.app, 'DELETE', `/api/projects/${team.sales}`, { mode: 'remove' }));
    expect(byName(team.app).has('Sales')).toBe(false);
    expect(byName(team.app).has('Finance')).toBe(true);
    expect(readFileSync(join(team.repo, 'domains/sales', SALES_FILE), 'utf8')).toBe(SALES_TEXT);
    expect(team.porcelain()).toBe('');
    expect(sh(team.repo, ['rev-parse', 'HEAD'])).toBe(head);
    expect(team.app.ws.trash.list()).toEqual([]);
  } finally {
    team.dispose();
  }
});

test('Delete folder moves only that subfolder to the trash and restore never overwrites', async () => {
  const team = await teamWorkspace();
  const salesPath = `/api/projects/${team.sales}`;
  try {
    const unconfirmed = await call(team.app, 'DELETE', salesPath, { mode: 'delete' });
    expect(unconfirmed.status).toBe(400);
    const deleted = await ok(call(team.app, 'DELETE', salesPath, { mode: 'delete', confirm: true }));
    expect(existsSync(join(team.repo, 'domains/sales'))).toBe(false);
    const financeFile = join(team.repo, 'domains/finance', FINANCE_FILE);
    expect(readFileSync(financeFile, 'utf8')).toBe(FINANCE_TEXT);
    expect(team.porcelain()).toBe(`D domains/sales/${SALES_FILE}`);
    expect(team.app.ws.trash.list()[0]).toMatchObject({ kind: 'subproject' });

    mkdirSync(join(team.repo, 'domains/sales'));
    const occupied = await call(team.app, 'POST', `/api/trash/${deleted.entryId}/restore`, {});
    expect(occupied.status).toBe(409);
    expect(byName(team.app).has('Sales')).toBe(false);
    rmSync(join(team.repo, 'domains/sales'), { recursive: true });
    await ok(call(team.app, 'POST', `/api/trash/${deleted.entryId}/restore`, {}));
    expect(team.porcelain()).toBe('');
    expect(byName(team.app).get('Sales')).toMatchObject({ folder: 'monorepo/domains/sales' });
  } finally {
    team.dispose();
  }
});

test('Clear trashes a repository with subprojects as one entry and Undo restores every project', async () => {
  const team = await teamWorkspace();
  try {
    const cleared = await ok(call(team.app, 'POST', '/api/clear', { confirm: true }));
    expect(cleared.entries).toHaveLength(1);
    expect(team.app.ws.trash.list()[0]).toMatchObject({ kind: 'repository' });
    expect(existsSync(team.repo)).toBe(false);
    await ok(call(team.app, 'POST', `/api/trash/${cleared.entries[0]}/undo`));
    expect([...byName(team.app).keys()].sort()).toEqual(['Finance', 'Sales']);
    expect(sh(team.repo, ['log', '-1', '--format=%s']).trim()).toBe('Fixture');
    expect(team.porcelain()).toBe('');
  } finally {
    team.dispose();
  }
});

test('without a manifest the folders are proposed, confirmed and optionally saved', async () => {
  const source = bareRepository('monorepo-no-manifest');
  const app = await testWorkspace();
  const repoName = 'monorepo-no-manifest';
  const route = `/api/repos/${repoName}`;
  try {
    const done = await cloned(app, source.bare);
    expect(done.candidates).toEqual([
      { path: 'domains/finance', files: 1 },
      { path: 'domains/sales', files: 1 },
    ]);
    expect(app.ws.state.registry().projects.map(project => project.slug)).toEqual([repoName]);
    const offered = await ok(call(app, 'GET', route + '/project-candidates'));
    expect(offered).toMatchObject({ manifest: null, manifestHash: null });
    expect(offered.registered).toEqual([{ slug: repoName, name: repoName, path: '' }]);

    const stale = await call(app, 'PUT', route + '/projects', {
      projects: [{ path: 'domains/sales' }],
      saveManifest: true,
      manifestBaseHash: 'f'.repeat(64),
    });
    expect(stale.status).toBe(409);
    const refusedLists = [[{ path: '../x' }], [{ path: 'domains/missing' }], [{ path: 'domains' }, { path: 'domains/sales' }]];
    for (const projects of refusedLists) {
      const refused = await call(app, 'PUT', route + '/projects', { projects });
      expect({ projects, status: refused.status }).toEqual({ projects, status: 400 });
    }

    const registered = await ok(
      call(app, 'PUT', route + '/projects', {
        projects: MANIFEST.projects,
        saveManifest: true,
        manifestBaseHash: null,
      }),
    );
    expect(registered.projects.map((project: any) => project.folder)).toEqual([`${repoName}/domains/sales`, `${repoName}/domains/finance`]);
    const slugs = app.ws.state.registry().projects.map(project => project.slug);
    expect(slugs).not.toContain(repoName);
    const repo = join(app.root, 'projects', repoName);
    const saved = JSON.parse(readFileSync(join(repo, '.semantic-workbench.json'), 'utf8'));
    expect(saved).toEqual(MANIFEST);
    expect(sh(repo, ['status', '--porcelain']).trim()).toBe('?? .semantic-workbench.json');
  } finally {
    app.dispose();
    source.dispose();
  }
});

test('a manifest naming a missing folder is reported and the repository stays one project', async () => {
  const source = bareRepository('single');
  const work = join(source.dir, 'broken-manifest');
  sh(source.dir, ['clone', '-q', source.bare, work]);
  const manifest = { ...MANIFEST, projects: [{ path: 'domains/missing' }] };
  writeFileSync(join(work, '.semantic-workbench.json'), JSON.stringify(manifest));
  sh(work, ['add', '.']);
  sh(work, ['commit', '-qm', 'Manifest']);
  sh(work, ['push', '-q', 'origin', 'main']);
  const app = await testWorkspace();
  try {
    const done = await cloned(app, source.bare);
    expect(done.phase).toBe('done');
    expect(done.manifestError).toContain('domains/missing');
    expect(app.ws.state.registry().projects.map(project => project.slug)).toEqual(['single']);
  } finally {
    app.dispose();
    source.dispose();
  }
});

test('a repository root project whose name differs from its folder restores intact', async () => {
  const source = bareRepository('monorepo-no-manifest');
  const app = await testWorkspace();
  const route = '/api/repos/monorepo-no-manifest/projects';
  try {
    await cloned(app, source.bare);
    await ok(call(app, 'PUT', route, { projects: MANIFEST.projects }));
    const root = await ok(call(app, 'PUT', route, { projects: [{ path: '', name: 'Team' }] }));
    const slug = root.projects[0].slug;
    expect(slug).toBe('team');
    const deleted = await ok(call(app, 'DELETE', `/api/projects/${slug}`, { confirm: true }));
    await ok(call(app, 'POST', `/api/trash/${deleted.entryId}/restore`, {}));
    const restored = app.ws.state.registry().projects.find(project => project.slug === slug)!;
    expect(restored.folder).toBeUndefined();
    const text = app.ws.readFile(slug, 'domains/sales/sales.ontology.yaml').source;
    expect(text).toBe(ontologyText('Sales', ['Customer', 'Order']));
  } finally {
    app.dispose();
    source.dispose();
  }
});

test('the last project of a repository cannot be removed, and deleting it moves the repository', async () => {
  const team = await teamWorkspace();
  try {
    await ok(call(team.app, 'DELETE', `/api/projects/${team.sales}`, { mode: 'remove' }));
    const refused = await call(team.app, 'DELETE', `/api/projects/${team.finance}`, {
      mode: 'remove',
    });
    expect(refused.status).toBe(400);
    expect(byName(team.app).has('Finance')).toBe(true);
    const impact = await ok(call(team.app, 'GET', `/api/projects/${team.finance}/delete-impact`));
    expect(impact).toMatchObject({ subproject: true, repo: 'monorepo', sharedWith: [] });
    await ok(
      call(team.app, 'DELETE', `/api/projects/${team.finance}`, {
        mode: 'delete',
        confirm: true,
      }),
    );
    expect(existsSync(team.repo)).toBe(false);
    expect(team.app.ws.trash.list()[0]).toMatchObject({ kind: 'repository' });
  } finally {
    team.dispose();
  }
});
