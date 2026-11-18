import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { meshWorkspace, publishDependent } from '../helpers/mesh-workspace';

test('reviewed conversion inlines declared parts and the frozen provider into the saved root', async () => {
  using fixture = await meshWorkspace('separate');
  await publishDependent(fixture);
  const path = 'ontology.yaml';
  const route = async (operation: string, body: object) =>
    fixture.fixture.handler(
      new Request(`http://localhost:4310/api/projects/retail/compile/${operation}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  const check = await route('check', { source: 'working' });
  expect(check.status).toBe(200);
  const { report } = await check.json();
  const inputs = report.inputs.map(({ path, sha256 }: { path: string; sha256: string }) => ({ path, sha256 }));
  const conversion = await route('convert', { path, baseHash: inputs.find((file: { path: string }) => file.path === path).sha256, inputs, accept: { digest: report.digest } });
  if (!conversion.ok) throw new Error(await conversion.text());
  const converted = readFileSync(join(fixture.projectDirectory('retail'), path), 'utf8');
  expect(converted).toContain('finance~ontology%2Eyaml~Invoice');
  expect(converted).toContain('Customer');
  expect(converted).not.toMatch(/tessera|fin\.Invoice/);
});
