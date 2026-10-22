// Checks that the access fixture loads cleanly and holds what the access tests rely on.
import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import accessSchema from '../../schemas/semantic-workbench-access-v1.json';
import { buildContext } from '../../server/agent/runtime';
import {
  AUTH_FIXTURE,
  AUTH_PROJECTS,
  authWorkspace,
  fixtureFiles,
  leakMarker,
} from '../helpers/auth-workspace';
import { TEST_GROUPS } from '../helpers/auth-identities';

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(accessSchema);

const adminFiles: [string, string][] = [
  ['admin/projects.json', 'projectsFile'],
  ['admin/roles.json', 'rolesFile'],
  ['admin/grants.json', 'grantsFile'],
  ['admin-keycloak/grants.json', 'grantsFile'],
  ['admin/agents.json', 'agentsFile'],
  ['admin/deactivated.json', 'deactivatedFile'],
  ['admin/settings.json', 'settingsFile'],
];

test('every access file of the fixture matches the pinned access schema', () => {
  for (const [file, definition] of adminFiles) {
    const validate = ajv.getSchema(`semantic-workbench/access/v1#/$defs/${definition}`)!;
    const data = JSON.parse(readFileSync(join(AUTH_FIXTURE, file), 'utf8'));
    expect({ file, valid: validate(data), errors: validate.errors ?? null }).toEqual({
      file,
      valid: true,
      errors: null,
    });
  }
});

test('every fixture file carries its own leak marker', () => {
  for (const project of AUTH_PROJECTS)
    for (const file of fixtureFiles(project))
      expect(file.source).toContain(leakMarker(project, file.path));
});

test('the fixture imports into a workspace with every project under its own slug', async () => {
  await using workspace = await authWorkspace();
  const listed = (await workspace.ws.listProjects()) as { slug: string }[];
  expect(listed.map(project => project.slug).sort()).toEqual([...AUTH_PROJECTS].sort());
  expect(existsSync(join(workspace.root, 'admin', 'grants.json'))).toBe(true);
});

test('every fixture file is valid and has a document type', async () => {
  await using workspace = await authWorkspace();
  const listed = (await workspace.ws.listProjects()) as {
    slug: string;
    files: { path: string; valid: boolean; docType: string }[];
  }[];
  const files = listed.flatMap(project =>
    project.files.map(file => ({ ...file, project: project.slug })),
  );
  expect(files.length).toBe(10);
  for (const file of files)
    expect({ path: `${file.project}/${file.path}`, valid: file.valid }).toEqual({
      path: `${file.project}/${file.path}`,
      valid: true,
    });
  const metrics = files.find(file => file.path === 'sales.semantic.yaml');
  expect(metrics?.docType).toBeTruthy();
});

test('the sales mapping resolves references in two other projects', async () => {
  await using workspace = await authWorkspace();
  const context = buildContext(workspace.ws.documents(), 'sales-contracts/sales.mapping.yaml');
  expect(context.findings).toEqual([]);
  const used = JSON.stringify(context.documents);
  expect(used).toContain('shared-reference/reference.ontology.yaml');
  expect(used).toContain('sales-metrics/sales.semantic.yaml');
  const people = buildContext(workspace.ws.documents(), 'sales-contracts/people.mapping.yaml');
  expect(JSON.stringify(people.documents)).toContain('hr-people/people.ontology.yaml');
});

test('the Keycloak grants name groups where the Entra grants hold object ids', () => {
  const read = (file: string) => JSON.parse(readFileSync(join(AUTH_FIXTURE, file), 'utf8'));
  const entra = read('admin/grants.json').grants;
  const keycloak = read('admin-keycloak/grants.json').grants;
  expect(keycloak.map((grant: { id: string }) => grant.id)).toEqual(
    entra.map((grant: { id: string }) => grant.id),
  );
  const salesEditors = keycloak.find((grant: { id: string }) => grant.id === 'g-sales-editors');
  expect(salesEditors.member.groupId).toBe(TEST_GROUPS.salesEditors.name);
});
