/** Builds disposable published mesh repositories with controlled working and branch changes. */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createHandler } from '../../src/server/handler';
import { openWorkspace } from '../../src/server/projects/workspace';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { locationOf } from '../../src/server/projects/paths';
import { accessFixture, boundaryReader, person } from '../auth/access-fixture';
import { publishFixture } from './published-workspace';
import { testWorkspace } from './temp-data-dir';

/** The two supported repository layouts for the same project identities. */
export type MeshRepositoryShape = 'shared' | 'separate';

/** The mesh projects have the same names in either repository layout. */
export const MESH_PROJECTS = ['finance', 'units', 'retail'] as const;

const placeholder = 'version: 0.2.0.dev0\nname: Placeholder\nontology:\n  - concept: Placeholder\n    type: EntityType\n';

function writeText(path: string, source: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
}

function fixtureSources(project: string): Record<string, string> {
  const header = { tessera: 3, version: '0.2.0.dev0', name: project };
  if (project === 'finance') {
    return {
      'ontology.yaml': JSON.stringify({
        ...header,
        tessera_exports: ['Invoice', 'Currency'],
        ontology: [
          { concept: 'Invoice', type: 'EntityType' },
          { concept: 'Currency', type: 'ValueType' },
        ],
      }),
    };
  }
  if (project === 'units') {
    return { 'ontology.yaml': JSON.stringify({ ...header, tessera_exports: ['Quantity'], ontology: [{ concept: 'Quantity', type: 'ValueType' }] }) };
  }
  const root = { ...header, tessera_includes: ['private/customer.yaml'], ontology: [{ concept: 'Order', type: 'EntityType' }] };
  const part = { tessera: 3, tessera_part: true, ontology: [{ concept: 'Customer', type: 'EntityType' }] };
  return { 'ontology.yaml': JSON.stringify(root), 'private/customer.yaml': JSON.stringify(part) };
}

/** Creates a reader whose only hidden unit file is the restricted retail part. */
export function meshReader(name: 'alice' | 'bob') {
  const options = accessFixture();
  const read = (file: string) => JSON.parse(readFileSync(`tests/fixtures/tessera/mesh/access/${file}.json`, 'utf8'));
  const config = { ...options.config, projects: read('projects'), grants: read('grants').grants };
  const access = createAccessControl({ ...options, config, knownProjects: () => [...MESH_PROJECTS] });
  const principal = access.principalFor(person(name));
  return boundaryReader(access.view(principal), principal.id);
}

type MeshFixture = Awaited<ReturnType<typeof testWorkspace>>;

function projectDirectory(fixture: MeshFixture, project: string): string {
  const entry = fixture.ws.state.registry().projects.find(entry => entry.slug === project);
  if (!entry) throw new Error(`Missing fixture project ${project}.`);
  return join(fixture.root, 'projects', locationOf(entry).folder);
}

function fixtureGit(fixture: MeshFixture, project: string, args: string[]): string {
  const directory = join(fixture.root, 'projects', fixture.ws.repoOf(project));
  const result = Bun.spawnSync(['git', ...args], { cwd: directory, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

async function seedProjects(fixture: MeshFixture, shape: MeshRepositoryShape) {
  if (shape === 'separate') {
    for (const project of MESH_PROJECTS) await fixture.seed([{ path: 'ontology.yaml', source: placeholder }], project);
  } else {
    await fixture.seed([{ path: 'placeholder.yaml', source: placeholder }], 'mesh');
    for (const project of MESH_PROJECTS) mkdirSync(join(fixture.root, 'projects', 'mesh', project), { recursive: true });
    await fixture.ws.registerRepositoryProjects(
      'mesh',
      MESH_PROJECTS.map(project => ({ path: project, name: project })),
    );
    rmSync(join(fixture.root, 'projects', 'mesh', 'placeholder.yaml'));
  }
  for (const project of MESH_PROJECTS) {
    for (const [path, source] of Object.entries(fixtureSources(project))) writeText(join(projectDirectory(fixture, project), path), source + '\n');
  }
  await publishFixture(fixture);
}

async function publishProviderChange(fixture: MeshFixture, shape: MeshRepositoryShape, project: 'finance' | 'units', description: string) {
  const path = join(projectDirectory(fixture, project), 'ontology.yaml');
  const source = JSON.parse(readFileSync(path, 'utf8'));
  source.ontology[0].description = description;
  writeText(path, JSON.stringify(source, null, 2) + '\n');
  const repository = fixture.ws.repoOf(project);
  const projectPath = shape === 'shared' ? `${project}/ontology.yaml` : 'ontology.yaml';
  fixtureGit(fixture, project, ['add', '--', projectPath]);
  fixtureGit(fixture, project, ['commit', '-qm', 'Change provider interface']);
  const commit = fixtureGit(fixture, project, ['rev-parse', 'HEAD']);
  const state = fixture.ws.state.published();
  const branch = state.repositories[repository].branch;
  fixtureGit(fixture, project, ['update-ref', `refs/heads/${branch}`, commit]);
  state.repositories[repository] = { branch, commit };
  fixture.ws.state.writePublished(state);
  fixture.ws.close();
  fixture.ws = await openWorkspace({ root: fixture.root });
  fixture.handler = createHandler(fixture.ws);
  fixture.seed = (files, name) => fixture.ws.importBatch({ files, ...(name ? { name } : {}) }, LOCAL_READER);
  return commit;
}

function addUncommittedImport(fixture: MeshFixture) {
  const path = join(projectDirectory(fixture, 'retail'), 'ontology.yaml');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  data.tessera_imports = [{ project: 'finance', alias: 'fin', concepts: ['Invoice'], version: 'latest' }];
  writeText(path, JSON.stringify(data, null, 2) + '\n');
}

/** Installs source through external Git writes so invalid refusal inputs need no save bypass. */
export async function meshWorkspace(shape: MeshRepositoryShape) {
  const fixture = await testWorkspace();
  try {
    await seedProjects(fixture, shape);
    return {
      fixture,
      get ws() {
        return fixture.ws;
      },
      projectDirectory: (project: string) => projectDirectory(fixture, project),
      git: (project: string, args: string[]) => fixtureGit(fixture, project, args),
      publishProviderChange: (project: 'finance' | 'units', description: string) => publishProviderChange(fixture, shape, project, description),
      /** Adds an import to disk without staging, committing or changing the published pointer. */
      addUncommittedImport: () => addUncommittedImport(fixture),
      /** Creates a personal branch without advancing the default branch or its published pointer. */
      addPersonalBranch(project: string) {
        fixtureGit(fixture, project, ['switch', '-c', 'personal-fixture']);
      },
      [Symbol.dispose]() {
        fixture.ws.close();
        fixture.dispose();
      },
    };
  } catch (error) {
    fixture.dispose();
    throw error;
  }
}
