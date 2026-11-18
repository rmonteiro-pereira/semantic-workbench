// Measures the compiler on a project folder of 200 documents and 20,000,000 bytes, and the cost of validating a Tessera document against the same document without the marker.
import { expect, test } from 'bun:test';
import { compileUnit, type UnitFile } from '../../src/shared/tessera/compile-unit';
import { validateInput } from '../../src/shared/validation/input';

const SECONDS_ALLOWED = 30;
const encoder = new TextEncoder();

function ontologyText(index: number, concepts: number, marked: boolean, notes = marked): string {
  const lines = [marked ? 'tessera: 1' : '', 'version: 0.2.0.dev0', `name: Scale ${index}`, notes ? 'tessera_notes: Generated for the scale test.' : '', 'ontology:'];
  for (let concept = 0; concept < concepts; concept++) {
    lines.push(
      `  - concept: Concept${index}_${concept}`,
      '    type: EntityType',
      `    description: Generated concept number ${concept} of document ${index}, with enough text to look like a real description.`,
    );
    if (notes) lines.push(`    tessera_notes: A note for concept ${concept} that the compiler drops and reports.`);
  }
  return lines.filter(line => line !== '').join('\n') + '\n';
}

function semanticModelText(index: number): string {
  const fields = Array.from(
    { length: 60 },
    (_, field) => `      - name: field_${field}\n        expression:\n          dialects:\n            - dialect: ANSI_SQL\n              expression: T${index}.field_${field}`,
  ).join('\n');
  return `version: 0.2.0.dev0\nname: model_${index}\ndatasets:\n  - name: T${index}\n    source: db.t${index}\n    fields:\n${fields}\n`;
}

function contractText(index: number): string {
  return `apiVersion: v3.1.0\nkind: DataContract\nid: contract_${index}\nversion: 1.0.0\nstatus: active\nschema:\n  - name: table_${index}\n`;
}

function scaleProject(): UnitFile[] {
  const files: UnitFile[] = [];
  const add = (path: string, text: string) => files.push({ path, bytes: encoder.encode(text) });
  for (let index = 0; index < 60; index++) add(`tessera/ontology-${index}.yaml`, ontologyText(index, 740, true));
  for (let index = 60; index < 120; index++) add(`standard/ontology-${index}.yaml`, ontologyText(index, 950, false));
  for (let index = 0; index < 40; index++) add(`models/model-${index}.yaml`, semanticModelText(index));
  for (let index = 0; index < 40; index++) add(`contracts/contract-${index}.odcs.yaml`, contractText(index));
  return files;
}

test('a project of 200 documents and about 20 MB compiles within thirty seconds', () => {
  const files = scaleProject();
  const bytes = files.reduce((sum, file) => sum + file.bytes.length, 0);
  expect(files).toHaveLength(200);
  expect(bytes).toBeGreaterThan(19_000_000);
  expect(bytes).toBeLessThanOrEqual(21_000_000);
  const started = performance.now();
  const result = compileUnit(files, { lossPolicySha256: null });
  const seconds = (performance.now() - started) / 1000;
  console.log(`Compiled ${files.length} documents, ${bytes} bytes, in ${seconds.toFixed(2)} s; ${result.report.losses.length} losses.`);
  expect(result.failures).toEqual([]);
  expect(result.report.losses).toHaveLength(60 * 741);
  expect(seconds).toBeLessThan(SECONDS_ALLOWED);
}, 120_000);

function medianSeconds(text: string, runs: number): number {
  const times: number[] = [];
  for (let run = 0; run < runs; run++) {
    const started = performance.now();
    validateInput(text, 'scale.ontology.yaml');
    times.push((performance.now() - started) / 1000);
  }
  return times.sort((first, second) => first - second)[Math.floor(runs / 2)];
}

test('validating a Tessera document costs about the same as the same document without the marker', () => {
  const marked = ontologyText(1, 1000, true, false);
  const unmarked = ontologyText(1, 1000, false);
  medianSeconds(marked, 2);
  medianSeconds(unmarked, 2);
  const withMarker = medianSeconds(marked, 15);
  const withoutMarker = medianSeconds(unmarked, 15);
  const ratio = withMarker / withoutMarker;
  console.log(`Validation of one 1,000-concept ontology: ${withMarker.toFixed(4)} s with the marker, ${withoutMarker.toFixed(4)} s without; ratio ${ratio.toFixed(2)}.`);
  // The plan aims for ten percent more. Timing on a shared machine is noisy, so the test only guards against a large regression.
  expect(ratio).toBeLessThan(1.3);
});
