// Builds a server-mode workspace whose one repository holds three projects in two domains, so
// tests can act as several people with different authority over the projects a proposal declares.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createAccessControl } from '../../src/server/auth/authorize';
import type { CloneEvent } from '../../src/server/projects/clone';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { accessFixture, person } from '../auth/access-fixture';
import { apiRequest, signedIn } from '../auth/working-copy-fixture';
import { isolateGit, testWorkspace } from './temp-data-dir';
import { ontologyText } from './git-fixtures';

/** The three project folders of the shared repository and the access domain of each. */
const PROJECT_FOLDERS = [
  { path: 'domains/sales', name: 'Sales', domain: 'sales' },
  { path: 'domains/billing', name: 'Billing', domain: 'sales' },
  { path: 'domains/people', name: 'People', domain: 'hr' },
] as const;

/** A project of the shared repository: its registered slug and the file the tests edit. */
export type SharedProject = { slug: string; file: string };

function git(cwd: string, args: string[]) {
  const result = Bun.spawnSync(['git', ...args], { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (result.exitCode !== 0) throw Error(`git ${args.join(' ')}: ${result.stderr.toString()}`);
  return result.stdout.toString();
}

function threeProjectRemote() {
  isolateGit();
  const directory = mkdtempSync(join(tmpdir(), 'workbench-proposals-'));
  const work = join(directory, 'work');
  const bare = join(directory, 'shared.git');
  mkdirSync(work);
  git(work, ['init', '-q', '-b', 'main']);
  for (const folder of PROJECT_FOLDERS) {
    const file = join(work, folder.path, `${folder.name.toLowerCase()}.ontology.yaml`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, ontologyText(folder.name, ['Customer', 'Order']));
  }
  const manifest = { schema: 'semantic-workbench/repository/v1', projects: PROJECT_FOLDERS.map(({ path, name }) => ({ path, name })) };
  writeFileSync(join(work, '.semantic-workbench.json'), JSON.stringify(manifest, null, 2) + '\n');
  git(work, ['add', '-A']);
  git(work, ['commit', '-q', '-m', 'Fixture']);
  git(directory, ['clone', '-q', '--bare', work, bare]);
  return { bare, dispose: () => rmSync(directory, { recursive: true, force: true }) };
}

async function waitForClone(ws: Awaited<ReturnType<typeof testWorkspace>>['ws'], bare: string) {
  const started = ws.clone(bare, undefined, LOCAL_READER);
  for (let attempt = 0; attempt < 600; attempt++) {
    const done = ws.events.replay(0)!.some(event => {
      const data = event.data as CloneEvent;
      return event.event === 'clone' && data.op === started.op && data.phase === 'done';
    });
    if (done) return;
    await Bun.sleep(10);
  }
  throw Error('The fixture clone did not finish.');
}

/** Opens the workspace with the shared repository cloned and the access rules for its projects. */
export async function proposalFixture() {
  const remote = threeProjectRemote();
  const workspace = await testWorkspace();
  await waitForClone(workspace.ws, remote.bare);
  const registered = workspace.ws.state.registry().projects;
  const projects = Object.fromEntries(
    PROJECT_FOLDERS.map(folder => {
      const slug = registered.find(project => project.name === folder.name)!.slug;
      return [folder.name.toLowerCase(), { slug, file: `${folder.name.toLowerCase()}.ontology.yaml` }];
    }),
  ) as Record<'sales' | 'billing' | 'people', SharedProject>;
  const options = accessFixture();
  for (const folder of PROJECT_FOLDERS) {
    const { slug } = projects[folder.name.toLowerCase() as keyof typeof projects];
    options.config.projects.projects[slug] = { domain: folder.domain, stewards: [], restricted: [], protectedBranches: ['main'] };
  }
  const access = createAccessControl({ ...options, knownProjects: () => registered.map(project => project.slug) });
  const as = signedIn(workspace.ws, access);
  return {
    ...workspace,
    projects,
    repository: workspace.ws.repoOf(projects.sales.slug),
    as,
    alice: () => as(person('alice')),
    bob: () => as(person('bob')),
    carol: () => as(person('carol')),
    dave: () => as(person('dave')),
    dispose: () => {
      workspace.dispose();
      remote.dispose();
    },
    [Symbol.dispose]() {
      workspace.dispose();
      remote.dispose();
    },
  };
}

/** The API path of a project's files. */
export const filePath = (slug: string, file: string) => `/api/projects/${slug}/files/${file}`;

type Caller = ReturnType<ReturnType<typeof signedIn>>;

/** Answers with status, headers and body text, so two answers can be compared as a client sees them. */
export async function rawAnswer(caller: Caller, path: string, method = 'GET', body?: unknown) {
  const response = await caller.handler(apiRequest(path, method, body));
  const headers = Object.fromEntries(response.headers);
  delete headers['x-request-id'];
  delete headers.date;
  return { status: response.status, headers, body: await response.text() };
}

/** Edits a project's file in the person's copy, stages it and commits it, as the interface does. */
export async function commitEdit(caller: Caller, project: SharedProject, text: string, message = 'Edit') {
  const file = filePath(project.slug, project.file);
  const current = await caller.call(file);
  const saved = await caller.call(file, 'PUT', { baseHash: current.body.hash, source: current.body.source + text });
  if (saved.status !== 200) throw Error(`Save answered ${saved.status}: ${JSON.stringify(saved.body)}`);
  const base = `/api/projects/${project.slug}/git`;
  const staged = await caller.call(`${base}/stage`, 'POST', { all: true });
  if (staged.status !== 200) throw Error(`Stage answered ${staged.status}: ${JSON.stringify(staged.body)}`);
  const committed = await caller.call(`${base}/commit`, 'POST', { message });
  if (committed.status !== 200) throw Error(`Commit answered ${committed.status}: ${JSON.stringify(committed.body)}`);
  return committed.body;
}
