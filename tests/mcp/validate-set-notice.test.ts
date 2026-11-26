// validate_text checks one file, so for a root or part of an ontology set it also says whether the set could be
// checked for the caller, with the same notice the browser's file read gives.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createHandler } from '../../src/server/handler';
import { accessFixture, person } from '../auth/access-fixture';
import { apiRequest, ORIGIN } from '../auth/working-copy-fixture';
import { MESH_PROJECTS, meshWorkspace } from '../helpers/mesh-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { toolRunner } from './helpers/in-process-tools';

type Fixture = Awaited<ReturnType<typeof meshWorkspace>>;

const PART = 'private/customer.yaml';
const ROOT = 'ontology.yaml';

/** A tool runner and an HTTP handler for one person of the mesh access fixture, where alice cannot read the private part. */
function asPerson(fixture: Fixture, name: 'alice' | 'bob') {
  const options = accessFixture();
  const read = (file: string) => JSON.parse(readFileSync(`tests/fixtures/tessera/mesh/access/${file}.json`, 'utf8'));
  const config = { ...options.config, projects: read('projects'), grants: read('grants').grants };
  const access = createAccessControl({ ...options, config, knownProjects: () => [...MESH_PROJECTS] });
  const principal = access.principalFor(person(name));
  const handler = createHandler(fixture.ws, { mode: 'server', publicOrigin: ORIGIN, access, principal: () => principal, remoteCredentials: allowEveryRemote() });
  return { tools: toolRunner(handler, principal), handler };
}

async function validate(runner: ReturnType<typeof asPerson>, path: string, source: string) {
  const result = (await runner.tools.run('validate_text', { project: 'retail', path, source })) as any;
  expect(result.error).toBeUndefined();
  return result.structuredContent ?? result;
}

async function browserNotice(runner: ReturnType<typeof asPerson>, path: string) {
  const answer = await (await runner.handler(apiRequest(`/api/projects/retail/files/${path}`))).json();
  return answer.unitValidation.setNotChecked;
}

function sourceOf(fixture: Fixture, path: string) {
  return readFileSync(`${fixture.projectDirectory('retail')}/${path}`, 'utf8');
}

test('a part read by someone who can read the whole set carries setNotChecked false, as the file read does', async () => {
  using fixture = await meshWorkspace('separate');
  const bob = asPerson(fixture, 'bob');
  const answer = await validate(bob, PART, sourceOf(fixture, PART));
  expect(answer.data.setNotChecked).toBe(false);
  expect(await browserNotice(bob, PART)).toBe(false);
});

test('a root whose part the caller cannot read carries setNotChecked true, as the file read does', async () => {
  using fixture = await meshWorkspace('separate');
  const alice = asPerson(fixture, 'alice');
  const answer = await validate(alice, ROOT, sourceOf(fixture, ROOT));
  expect(answer.data.valid).toBe(true);
  expect(answer.data.setNotChecked).toBe(true);
  expect(await browserNotice(alice, ROOT)).toBe(true);
});

test('a file not yet saved carries no notice', async () => {
  using fixture = await meshWorkspace('separate');
  const bob = asPerson(fixture, 'bob');
  const placeholder = 'version: 0.2.0.dev0\nname: Loose\nontology:\n  - concept: Loose\n    type: EntityType\n';
  const unsaved = await validate(bob, 'loose.ontology.yaml', placeholder);
  expect(unsaved.data).not.toHaveProperty('setNotChecked');
});
