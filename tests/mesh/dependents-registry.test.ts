import { expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { meshWorkspace, publishDependent } from '../helpers/mesh-workspace';

test('published imports rebuild identically and disappear on consumer removal', async () => {
  using fixture = await meshWorkspace('separate');
  await publishDependent(fixture);
  const entries = await fixture.ws.dependents.read();
  expect(entries).toMatchObject([{ consumer: 'retail', provider: 'finance', concepts: ['Invoice'] }]);
  const path = join(fixture.ws.layout.mesh, 'dependents.json');
  expect(existsSync(path)).toBe(true);
  rmSync(path);
  expect(await fixture.ws.dependents.read()).toEqual(entries);
  await fixture.ws.trash.deleteProject('retail');
  expect(existsSync(path)).toBe(false);
  expect(await fixture.ws.dependents.read()).toEqual([]);
});
