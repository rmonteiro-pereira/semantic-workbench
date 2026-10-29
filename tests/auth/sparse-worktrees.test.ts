// A project that lives in one folder of a team repository, in server mode: the published checkout
// and every person's working copy hold only that folder, and the guards see project paths.
import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createAccessControl } from '../../src/server/auth/authorize';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { locationOf } from '../../src/server/projects/paths';
import { testWorkspace } from '../helpers/temp-data-dir';
import { OTHER_FOLDER, PROJECT_FOLDER, cloneOutcome, teamRepository } from '../helpers/sparse-fixtures';
import { accessFixture, person } from './access-fixture';
import { copyFolder, gitOutput, saveText, signedIn, textAt } from './working-copy-fixture';

const note = (text: string) => `${text}# alice was here\n`;

async function sparseServerWorkspace() {
  const team = teamRepository();
  const fixture = await testWorkspace();
  const started = fixture.ws.clone(team.address, undefined, LOCAL_READER, undefined, undefined, {
    folder: PROJECT_FOLDER,
  });
  const done = await cloneOutcome(fixture, started.op);
  expect(done.phase).toBe('done');
  const project = fixture.ws.state.registry().projects.find(entry => entry.slug === started.slug)!;
  const options = accessFixture();
  options.config.projects.projects[project.slug] = {
    domain: 'sales',
    stewards: [],
    restricted: [],
    protectedBranches: [],
  };
  const access = createAccessControl({ ...options, knownProjects: () => [project.slug] });
  return { team, fixture, project, as: signedIn(fixture.ws, access) };
}

test('a personal copy of a sparse project holds only the folder and maps project paths', async () => {
  const { team, fixture, project, as } = await sparseServerWorkspace();
  try {
    const alice = as(person('alice'));
    const repo = locationOf(project).repo;
    expect((await saveText(alice.call, project.slug, 'shop.yaml', note)).status).toBe(200);

    const copy = copyFolder(fixture.ws, alice.principal.key, repo);
    expect(gitOutput(copy, ['sparse-checkout', 'list']).text).toBe(PROJECT_FOLDER);
    expect(existsSync(join(copy, OTHER_FOLDER))).toBe(false);
    expect(textAt(join(copy, PROJECT_FOLDER), 'shop.yaml')).toContain('# alice was here');
    const base = join(fixture.ws.layout.projects, repo);
    expect(existsSync(join(base, OTHER_FOLDER))).toBe(false);
    expect(textAt(join(base, PROJECT_FOLDER), 'shop.yaml')).not.toContain('alice');

    const status = await alice.call(`/api/projects/${project.slug}/git/status`);
    expect(status.body).toMatchObject({ folder: PROJECT_FOLDER });
    expect(status.body.changes.map((change: any) => change.path)).toEqual(['shop.yaml']);

    const commit = await alice.call(`/api/projects/${project.slug}/git/commit`, 'POST', {
      message: 'Alice edits the shop',
      paths: ['shop.yaml'],
    });
    expect(commit.status).toBe(200);
    const touched = gitOutput(copy, ['show', '--name-only', '--format=', 'HEAD']).text;
    expect(touched).toBe(`${PROJECT_FOLDER}/shop.yaml`);
  } finally {
    fixture.dispose();
    team.dispose();
  }
});

test('a commit outside the folder is refused in a personal copy too', async () => {
  const { team, fixture, project, as } = await sparseServerWorkspace();
  try {
    const alice = as(person('alice'));
    const refused = await alice.call(`/api/projects/${project.slug}/git/commit`, 'POST', {
      message: 'Edit the readme',
      repoPaths: ['README.md'],
    });
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(refused.status).toBeLessThan(500);
  } finally {
    fixture.dispose();
    team.dispose();
  }
});

test('folder changes explain the server restriction without revealing unreadable projects', async () => {
  const { team, fixture, project, as } = await sparseServerWorkspace();
  try {
    const administrator = as(person('dave'));
    const carol = as(person('carol'));
    const route = `/api/projects/${project.slug}/git/folder`;
    const guidance = 'Choosing a folder for an existing project works in local mode. Clone the folder instead.';
    for (const method of ['GET', 'PUT']) {
      const path = method === 'GET' ? `${route}?folder=semantic%2Fother` : route;
      const body = method === 'PUT' ? { folder: 'semantic/other' } : undefined;
      const refused = await administrator.call(path, method, body);
      expect(refused.status).toBe(400);
      expect(refused.body.error).toBe(guidance);
      const hidden = await carol.call(path, method, body);
      expect(hidden.status).toBe(404);
      expect(hidden.body.error).not.toContain('Clone the folder');
    }
  } finally {
    fixture.dispose();
    team.dispose();
  }
});
