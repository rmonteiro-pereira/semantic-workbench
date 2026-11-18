// Measures a compile of a published project of 200 documents and about 20 MB through the whole path: reading the snapshot, compiling, building the bundle and the zip.
import { expect, test } from 'bun:test';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { bundleResponse } from '../../src/server/routes/compile';
import { compilePublished } from '../../src/server/tessera/compile-service';
import { workspaceUnitSource } from '../../src/server/tessera/workspace-unit-source';
import { publishFixture } from '../helpers/published-workspace';
import { testWorkspace } from '../helpers/temp-data-dir';

const SECONDS_ALLOWED = 30;
const TESSERA_DOCUMENTS = 60;
const STANDARD_DOCUMENTS = 140;

function ontologyText(index: number, concepts: number, tessera: boolean): string {
  const lines = [tessera ? 'tessera: 1' : '', 'version: 0.2.0.dev0', `name: Scale ${index}`, 'ontology:'];
  for (let concept = 0; concept < concepts; concept++) {
    lines.push(
      `  - concept: Concept${index}_${concept}`,
      '    type: EntityType',
      `    description: Generated concept number ${concept} of document ${index}, with enough text to look like a real description.`,
    );
    if (tessera) lines.push(`    tessera_notes: A note for concept ${concept} that the compile drops and reports.`);
  }
  return lines.filter(line => line !== '').join('\n') + '\n';
}

function projectFiles() {
  const files: { path: string; source: string }[] = [];
  for (let index = 0; index < TESSERA_DOCUMENTS; index++) files.push({ path: `tessera/ontology-${index}.yaml`, source: ontologyText(index, 740, true) });
  for (let index = 0; index < STANDARD_DOCUMENTS; index++) files.push({ path: `standard/ontology-${index}.yaml`, source: ontologyText(TESSERA_DOCUMENTS + index, 400, false) });
  return files;
}

test('a published project of 200 documents and about 20 MB compiles and zips within thirty seconds', async () => {
  using fixture = await testWorkspace();
  const files = projectFiles();
  const bytes = files.reduce((sum, file) => sum + Buffer.byteLength(file.source), 0);
  const { slug } = await fixture.seed(files, 'Scale');
  await publishFixture(fixture);
  expect(files).toHaveLength(200);
  expect(bytes).toBeGreaterThan(15_000_000);
  const units = workspaceUnitSource(fixture.ws, slug, LOCAL_READER);
  const shown = await compilePublished(units, {});
  if (shown.result !== 'loss-needs-acceptance') throw new Error('The project must need acceptance.');
  const digest = shown.report.digest;
  const started = performance.now();
  const outcome = await compilePublished(units, { accept: { digest } });
  if (outcome.result !== 'released') throw new Error(`Expected a release, got ${outcome.result}.`);
  const response = bundleResponse(outcome, slug, 64_000_000);
  const zipped = new Uint8Array(await response.arrayBuffer());
  const seconds = (performance.now() - started) / 1000;
  console.log(`Compiled and zipped ${files.length} documents, ${bytes} bytes, in ${seconds.toFixed(2)} s; ${outcome.report.losses.length} losses; archive ${zipped.length} bytes.`);
  expect(outcome.report.losses).toHaveLength(TESSERA_DOCUMENTS * 740);
  expect(zipped.length).toBeGreaterThan(bytes * 0.9);
  expect(seconds).toBeLessThan(SECONDS_ALLOWED);
}, 300_000);
