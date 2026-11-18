/** Proves fixture publication and read boundaries in both supported repository layouts. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { meshReader, meshWorkspace, MESH_PROJECTS } from '../helpers/mesh-workspace';

const decoder = new TextDecoder();

for (const shape of ['shared', 'separate'] as const) {
  test(`${shape} repositories expose only their committed snapshot after a working import`, async () => {
    using mesh = await meshWorkspace(shape);
    const repositories = MESH_PROJECTS.map(project => mesh.ws.repoOf(project));
    expect(new Set(repositories).size).toBe(shape === 'shared' ? 1 : 3);
    const before = await mesh.ws.published.withPin(pin => mesh.ws.published.fileBytes(pin, 'retail', 'ontology.yaml'));
    expect(before).not.toBeNull();
    mesh.addUncommittedImport();
    mesh.addPersonalBranch('retail');
    const working = readFileSync(join(mesh.projectDirectory('retail'), 'ontology.yaml'), 'utf8');
    const after = await mesh.ws.published.withPin(pin => mesh.ws.published.fileBytes(pin, 'retail', 'ontology.yaml'));
    expect(decoder.decode(after!)).toBe(decoder.decode(before!));
    expect(working).not.toBe(decoder.decode(after!));
    expect(JSON.parse(working).tessera_imports[0].project).toBe('finance');
    expect(mesh.git('retail', ['branch', '--show-current'])).toBe('personal-fixture');
  });

  test(`${shape} provider changes advance only their publication and retain unstaged imports`, async () => {
    using mesh = await meshWorkspace(shape);
    const original = mesh.ws.state.published().repositories[mesh.ws.repoOf('finance')].commit;
    mesh.addUncommittedImport();
    const changed = await mesh.publishProviderChange('finance', 'A published provider change.');
    expect(changed).not.toBe(original);
    expect(mesh.ws.state.published().repositories[mesh.ws.repoOf('finance')].commit).toBe(changed);
    const bytes = await mesh.ws.published.withPin(pin => mesh.ws.published.fileBytes(pin, 'finance', 'ontology.yaml'));
    expect(JSON.parse(decoder.decode(bytes!)).ontology[0].description).toBe('A published provider change.');
    const consumer = await mesh.ws.published.withPin(pin => mesh.ws.published.fileBytes(pin, 'retail', 'ontology.yaml'));
    expect(JSON.parse(decoder.decode(consumer!)).tessera_imports).toBeUndefined();
    expect(JSON.parse(readFileSync(join(mesh.projectDirectory('retail'), 'ontology.yaml'), 'utf8')).tessera_imports).toHaveLength(1);
  });

  test(`${shape} readers see their authorized parts and the fixture includes a project without a domain`, async () => {
    using mesh = await meshWorkspace(shape);
    const alice = meshReader('alice');
    const bob = meshReader('bob');
    const hidden = await mesh.ws.published.withPin(pin => mesh.ws.published.readableDocuments(pin, 'retail', alice));
    const complete = await mesh.ws.published.withPin(pin => mesh.ws.published.readableDocuments(pin, 'retail', bob));
    expect(hidden.documents.map(document => document.path)).toContain('ontology.yaml');
    expect(hidden.documents.map(document => document.path)).not.toContain('private/customer.yaml');
    expect(complete.documents.map(document => document.path)).toContain('private/customer.yaml');
    const access = JSON.parse(readFileSync('tests/fixtures/tessera/mesh/access/projects.json', 'utf8'));
    expect(access.projects.units.domain).toBeUndefined();
  });
}
