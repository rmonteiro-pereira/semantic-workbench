// Tests where the usage store lives in the data layout.
import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { dataLayout } from '../../src/server/projects/paths';
import { testWorkspace } from '../helpers/temp-data-dir';

test('the usage folder is under the state folder of the data root', () => {
  const layout = dataLayout('/data-root');
  expect(layout.usage).toBe(join(layout.state, 'usage'));
});

test('opening a workspace creates no usage folder', async () => {
  const workspace = await testWorkspace();
  try {
    expect(existsSync(dataLayout(workspace.root).usage)).toBe(false);
  } finally {
    workspace.dispose();
  }
});
