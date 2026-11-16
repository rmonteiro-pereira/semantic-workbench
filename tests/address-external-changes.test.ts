/** Confirms Source Control never guesses identity from external item renames. */
import { expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { call, ok, ontology, scmProject, sh } from './helpers/scm';
import { dataLayout } from '../src/server/projects/paths';
import { readAddressMigrations } from '../src/server/projects/address-migrations';
import { LOCAL_READER } from '../src/server/projects/reader';
import { resolveCurrentItem } from '../src/server/projects/address-resolution';
import { parseAddress } from '../src/shared/core/item-address';

test('pull and branch switch record no inferred rename and an undone rename resolves the original locator', async () => {
  const project = await scmProject();
  try {
    const original = ontology('Buys.');
    const renamed = original.replace('concept: Customer', 'concept: Client');
    const oldHead = sh(project.dir, ['rev-parse', 'HEAD']).trim();
    writeFileSync(join(project.other, 'shop.yaml'), renamed);
    sh(project.other, ['add', '.']);
    sh(project.other, ['commit', '-qm', 'Rename externally']);
    sh(project.other, ['push', '-q']);
    await ok(call(project.t, 'POST', project.base + '/git/pull'));
    const layout = dataLayout(project.t.root);
    expect(project.t.ws.readFile(project.slug, 'shop.yaml').source).toBe(renamed);
    expect(readAddressMigrations(layout, project.slug, LOCAL_READER)).toEqual([]);
    sh(project.dir, ['branch', 'before-rename', oldHead]);
    await ok(call(project.t, 'POST', project.base + '/git/switch', { branch: 'before-rename' }));
    expect(readAddressMigrations(layout, project.slug, LOCAL_READER)).toEqual([]);
    const address = parseAddress(`sw1:${project.slug}/shop.yaml#ontology:Shop/concept:Customer`);
    if (!address.ok) throw Error('Invalid fixture locator.');
    const context = { projectExists: () => true, readFile: project.t.ws.readFile };
    expect(resolveCurrentItem(context, address.address, LOCAL_READER).status).toBe('found');
    await ok(call(project.t, 'POST', project.base + '/git/switch', { branch: 'main' }));
    expect(resolveCurrentItem(context, address.address, LOCAL_READER).status).toBe('missing');
    await ok(call(project.t, 'POST', project.base + '/git/switch', { branch: 'before-rename' }));
    expect(resolveCurrentItem(context, address.address, LOCAL_READER).status).toBe('found');
    expect(readAddressMigrations(layout, project.slug, LOCAL_READER)).toEqual([]);
  } finally {
    project.dispose();
  }
});
