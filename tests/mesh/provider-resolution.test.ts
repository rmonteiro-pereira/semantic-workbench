/** Proves provider resolution reads publication objects and conceals unavailable identities. */
import { expect, spyOn, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveProvider, type ProviderResolution } from '../../src/server/mesh/provider-resolution';
import { LOCAL_READER, type Reader } from '../../src/server/projects/reader';
import { meshReader, meshWorkspace, MESH_PROJECTS } from '../helpers/mesh-workspace';

for (const shape of ['shared', 'separate'] as const) {
  test(`the ${shape} layout resolves the same pinned public interface without contacting a remote`, async () => {
    using fixture = await meshWorkspace(shape);
    const blocked = Object.assign(
      async () => {
        throw new Error('Network access is forbidden in this test.');
      },
      { preconnect: globalThis.fetch.preconnect },
    );
    const fetch = spyOn(globalThis, 'fetch').mockImplementation(blocked);
    try {
      const path = join(fixture.projectDirectory('finance'), 'ontology.yaml');
      const working = JSON.parse(readFileSync(path, 'utf8'));
      working.ontology[0].description = 'An unpublished change.';
      writeFileSync(path, JSON.stringify(working));
      const resolution: ProviderResolution = {
        snapshots: fixture.ws.published,
        repositoryOf: project => (MESH_PROJECTS.includes(project as (typeof MESH_PROJECTS)[number]) ? fixture.ws.repoOf(project) : null),
      };
      await fixture.ws.published.withPin(async pin => {
        const provider = await resolveProvider(resolution, pin, LOCAL_READER, 'finance');
        expect(provider.ontology).toBe('ontology.yaml');
        const commit = pin.commits.get(provider.repository)?.commit;
        if (!commit) throw new Error('Expected a published provider commit.');
        expect(provider.commit).toBe(commit);
        expect(provider.repository === fixture.ws.repoOf('retail')).toBe(shape === 'shared');
        expect([...provider.closure.concepts.keys()]).toEqual(['Currency', 'Invoice']);
        expect(provider.closure.concepts.get('Invoice')?.description).toBeUndefined();
        expect(provider.closure.interfaceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
}

test('hidden and missing providers fail before file access, while an authorized unpublished one has no snapshot', async () => {
  const authorized = meshReader('alice');
  if (!authorized.view) throw new Error('Expected a server reader.');
  const reader: Reader = { ...authorized, view: { ...authorized.view, readableProjects: new Set(['retail', 'unknown']) } };
  let objectReads = 0;
  const resolution: ProviderResolution = {
    repositoryOf: project => (project === 'unknown' ? null : project + '-repo'),
    snapshots: {
      documents: async () => {
        objectReads++;
        return [];
      },
    },
  };
  const pin = { commits: new Map() };
  const hidden = await resolveProvider(resolution, pin, reader, 'finance').catch(error => ({ name: error.name, message: error.message }));
  const missing = await resolveProvider(resolution, pin, reader, 'unknown').catch(error => ({ name: error.name, message: error.message }));
  expect(hidden).toEqual(missing);
  const unpublished = await resolveProvider(resolution, pin, reader, 'retail').catch(error => error.reason);
  expect(unpublished).toBe('no-commit');
  expect(objectReads).toBe(0);
});
