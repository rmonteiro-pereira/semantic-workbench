import { LOCAL_READER } from '../../src/server/projects/reader';
import { publishFixture } from '../../tests/helpers/published-workspace';
import { testWorkspace } from '../../tests/helpers/temp-data-dir';

/** Builds a synthetic ontology with the requested number of regular graph entities. */
export function measurementDefinitions(count: number, changed: boolean) {
  const rows = Array.from({ length: count }, (_, index) => ({
    concept: 'Entity ' + index,
    type: 'EntityType',
    description: changed && index % 20 === 0 ? 'Revised description.' : 'Published description.',
  }));
  return JSON.stringify({ name: 'Performance', ontology: rows });
}

/** Creates a disposable workspace containing a published commit and a saved working change. */
export async function measurementFixture(path: string, count: number) {
  const fixture = await testWorkspace({ watch: false });
  try {
    const { slug } = await fixture.seed([{ path, source: measurementDefinitions(count, false) }], 'Performance');
    await publishFixture(fixture);
    const source = measurementDefinitions(count, true);
    const file = fixture.ws.readFile(slug, path);
    await fixture.ws.saveFile(slug, path, { baseHash: file.hash, source }, LOCAL_READER);
    return { fixture, slug };
  } catch (error) {
    fixture.dispose();
    throw error;
  }
}
