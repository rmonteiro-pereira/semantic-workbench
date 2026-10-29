// A start in server mode puts back what local-mode deletions left deleted in the published
// checkout, and refuses to start over any other change there.
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'bun:test';
import { PublishedCheckoutChangedError } from '../../src/server/projects/published-checkout';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { openWorkspace } from '../../src/server/projects/workspace';
import { authWorkspace } from '../helpers/auth-workspace';
import { gitOutput } from './working-copy-fixture';

const MAPPING = 'sales.mapping.yaml';

async function deletedInLocalMode(fixture: Awaited<ReturnType<typeof authWorkspace>>) {
  const base = join(fixture.ws.layout.projects, 'sales-contracts');
  const entry = await fixture.ws.trash.deleteFile('sales-contracts', MAPPING, 'someone', LOCAL_READER);
  expect(gitOutput(base, ['status', '--porcelain']).text).toContain(`D ${MAPPING}`);
  return { base, entry };
}

const reopen = (fixture: Awaited<ReturnType<typeof authWorkspace>>, log: (line: string) => void) => {
  fixture.ws.close();
  return openWorkspace({ root: fixture.root, reconcilePublished: true, log });
};

test('deletions kept in the trash are restored from HEAD once, and the entry stays', async () => {
  using fixture = await authWorkspace();
  const { base, entry } = await deletedInLocalMode(fixture);
  const lines: string[] = [];
  const reopened = await reopen(fixture, line => lines.push(line));
  try {
    expect(existsSync(join(base, MAPPING))).toBe(true);
    expect(gitOutput(base, ['status', '--porcelain']).text).toBe('');
    expect(lines.map(line => JSON.parse(line))).toEqual([{ type: 'published-checkout-restored', repo: 'sales-contracts', paths: [MAPPING] }]);
    expect(reopened.trash.entry(entry.entryId).path).toBe(MAPPING);
  } finally {
    reopened.close();
  }
  // A second start finds nothing to do and says nothing.
  const again: string[] = [];
  const second = await openWorkspace({
    root: fixture.root,
    reconcilePublished: true,
    log: line => again.push(line),
  });
  second.close();
  expect(again).toEqual([]);
});

test('any other change in the published checkout stops the start and names its paths', async () => {
  using fixture = await authWorkspace();
  await deletedInLocalMode(fixture);
  const base = join(fixture.ws.layout.projects, 'sales-contracts');
  writeFileSync(join(base, 'orders.odcs.yaml'), '# edited by hand\n');
  writeFileSync(join(base, 'stray.txt'), 'x');
  fixture.ws.close();
  const error = await openWorkspace({ root: fixture.root, reconcilePublished: true }).catch(caught => caught);
  expect(error).toBeInstanceOf(PublishedCheckoutChangedError);
  expect(error.paths.sort()).toEqual(['orders.odcs.yaml', 'stray.txt']);
  expect(error.message).toContain('orders.odcs.yaml');
  // Nothing was restored before the refusal.
  expect(existsSync(join(base, MAPPING))).toBe(false);
});

test('local mode leaves its working changes alone', async () => {
  using fixture = await authWorkspace();
  const { base } = await deletedInLocalMode(fixture);
  fixture.ws.close();
  const local = await openWorkspace({ root: fixture.root });
  local.close();
  expect(existsSync(join(base, MAPPING))).toBe(false);
});
