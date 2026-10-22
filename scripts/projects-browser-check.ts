// Checks project navigation, external changes and stale saves in an isolated browser workspace.
import { appUrl } from './helpers/base-url';
import { chromium, expect } from '@playwright/test';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expectEditorValue, fillEditor } from './helpers/code-editor';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
// Browser check: project tree, live refresh after external edits, two-tab stale save, cache
// deletion and restart. Runs against an isolated temporary data root.
const api = await startIsolatedApi();
const shop =
  '# shop ontology\nname: Shop\nontology:\n  - concept: Customer\n    type: EntityType\n    description: A buyer.\n';
await api.ws.importBatch({
  files: [
    { path: 'shop.yaml', source: shop },
    { path: 'models/ref.ttl', source: '@prefix ex: <https://example.org/> .\nex:a ex:b ex:c .\n' },
  ],
});
await api.ws.loadExample('mapped-commerce');
writeFileSync(join(api.root, 'projects/shop/broken.yaml'), 'name: [unclosed');
writeFileSync(join(api.root, 'projects/shop/notes.csv'), 'a,b');
await api.ws.rescan('shop');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log('PASS', name);
}
async function openPage() {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await routeApi(page, api);
  await page.goto(appUrl());
  await expect(page.getByRole('tree', { name: 'Projects' })).toBeVisible();
  return page;
}
const fileButton = (page: any, path: string) =>
  page.getByRole('tree', { name: 'Projects' }).getByRole('button', { name: path, exact: true });
const sourceText = (page: any) => page.getByLabel('Definition source');
try {
  const a = await openPage();
  await check('sidebar tree lists projects with their files, types and validity', async () => {
    const tree = a.getByRole('tree', { name: 'Projects' });
    await expect(tree.getByRole('treeitem', { name: 'Shop', exact: true })).toBeVisible();
    await expect(
      tree.getByRole('treeitem', { name: 'Mapped commerce', exact: true }),
    ).toBeVisible();
    await expect(tree.getByRole('treeitem', { name: 'shop.yaml', exact: true })).toContainText(
      'Ossie ontology',
    );
    await expect(tree.getByRole('treeitem', { name: 'models/ref.ttl', exact: true })).toContainText(
      'RDF',
    );
    await expect(tree.getByRole('treeitem', { name: 'broken.yaml', exact: true })).toContainText(
      'invalid',
    );
    await expect(tree.getByRole('treeitem', { name: 'notes.csv' })).toHaveCount(0);
    await tree.getByRole('button', { name: 'Shop', exact: true }).click();
    await expect(fileButton(a, 'shop.yaml')).toHaveCount(0);
    await tree.getByRole('button', { name: 'Shop', exact: true }).click();
    await expect(fileButton(a, 'shop.yaml')).toBeVisible();
    await a.screenshot({ path: '/tmp/workbench-projects-tree.png' });
  });
  await check('an invalid file opens in Source for repair', async () => {
    await fileButton(a, 'broken.yaml').click();
    await expect(a.locator('.invalid-definition, .code')).toBeVisible();
    await a.locator('.tabs').getByRole('button', { name: 'Source', exact: true }).click();
    await expectEditorValue(sourceText(a), 'name: [unclosed');
  });
  await check('an external edit appears in the open tab within 2 s without a reload', async () => {
    await fileButton(a, 'shop.yaml').click();
    await expectEditorValue(sourceText(a), shop);
    const started = Date.now();
    appendFileSync(join(api.root, 'projects/shop/shop.yaml'), '# edited in a terminal\n');
    await expectEditorValue(sourceText(a), shop + '# edited in a terminal\n', { timeout: 2000 });
    console.log(`  external edit visible after ${Date.now() - started} ms`);
    writeFileSync(
      join(api.root, 'projects/shop/added.yaml'),
      'name: Added\nontology: [{concept: Added}]\n',
    );
    await expect(fileButton(a, 'added.yaml')).toBeVisible({ timeout: 2000 });
  });
  await check(
    'a save based on an older version is rejected with both versions shown (two tabs)',
    async () => {
      const b = await openPage();
      await fileButton(b, 'shop.yaml').click();
      await b.locator('.tabs').getByRole('button', { name: 'Source', exact: true }).click();
      const base = readFileSync(join(api.root, 'projects/shop/shop.yaml'), 'utf8');
      await expectEditorValue(sourceText(b), base);
      // Hold tab B's automatic save until tab A saves, so B submits a stale base version from
      // the older version and must be refused with both versions shown.
      let release: () => void = () => {};
      const held = new Promise<void>(r => {
        release = r;
      });
      let holding = true;
      await b.route('**/api/projects/shop/files/shop.yaml', async route => {
        if (holding && route.request().method() === 'PUT') await held;
        await route.fallback();
      });
      await fillEditor(sourceText(b), base.replace('A buyer.', 'Edited in tab B.'));
      await fillEditor(sourceText(a), base.replace('A buyer.', 'Saved from tab A.'));
      await expect(a.getByRole('status', { name: 'Save state' })).toHaveText(/^Saved to file/, {
        timeout: 5000,
      });
      await expect
        .poll(() => readFileSync(join(api.root, 'projects/shop/shop.yaml'), 'utf8'))
        .toContain('Saved from tab A.');
      holding = false;
      release();
      const dialog = b.getByRole('dialog', { name: /shop\.yaml changed since you opened it/ });
      await expect(dialog).toBeVisible({ timeout: 5000 });
      const diff = dialog.getByRole('group', { name: 'Your version and the current file' });
      await expect(diff).toContainText('Edited in tab B.');
      await expect(diff).toContainText('Saved from tab A.');
      await expect(diff.locator('.cm-changedLine').first()).toBeVisible();
      await b.screenshot({ path: '/tmp/workbench-projects-stale.png' });
      expect(readFileSync(join(api.root, 'projects/shop/shop.yaml'), 'utf8')).toContain(
        'Saved from tab A.',
      );
      // Keep editing: automatic saving of the file stays paused until the user chooses.
      await dialog.getByRole('button', { name: 'Keep editing' }).click();
      await expect(dialog).toHaveCount(0);
      await expectEditorValue(sourceText(b), /Edited in tab B\./);
      await expect(b.getByRole('status', { name: 'Save state' })).toHaveText(
        'Not saved: file changed on disk',
      );
      await b.waitForTimeout(1500);
      expect(readFileSync(join(api.root, 'projects/shop/shop.yaml'), 'utf8')).toContain(
        'Saved from tab A.',
      );
      await b.getByRole('status', { name: 'Save state' }).click();
      await b
        .getByRole('dialog')
        .getByRole('button', { name: 'Discard my edits and load the current file' })
        .click();
      await expectEditorValue(sourceText(b), /Saved from tab A\./);
      await b.route(
        '**/api/projects/shop/files/shop.yaml',
        async route => {
          if (route.request().method() === 'PUT')
            appendFileSync(
              join(api.root, 'projects/shop/shop.yaml'),
              '# another external change\n',
            );
          await route.fallback();
        },
        { times: 1 },
      );
      await fillEditor(sourceText(b), base.replace('A buyer.', 'Second edit in B.'));
      await b
        .getByRole('dialog')
        .getByRole('button', { name: 'Keep my version and save over it' })
        .click({ timeout: 5000 });
      await expect(b.getByRole('status', { name: 'Save state' })).toHaveText(/^Saved to file/, {
        timeout: 5000,
      });
      expect(readFileSync(join(api.root, 'projects/shop/shop.yaml'), 'utf8')).toBe(
        base.replace('A buyer.', 'Second edit in B.'),
      );
      await expectEditorValue(sourceText(a), base.replace('A buyer.', 'Second edit in B.'), {
        timeout: 2000,
      });
      await b.close();
    },
  );
  await check(
    'deleting the cache and restarting restores projects, files, view settings and drafts',
    async () => {
      const id = 'shop/shop.yaml';
      const grouping = {
        mode: 'types',
        assignments: { 'ontology/0': 'custom:Review' },
        names: { 'custom:Review': 'Review' },
      };
      await api.ws.saveGrouping(id, grouping);
      api.ws.state.writeDraft('shop', 'shop.yaml', {
        baseHash: null,
        text: 'unsaved draft',
        patches: [],
      });
      const before = await api.ws.listProjects();
      await api.restart({ deleteCache: true });
      expect(api.ws.cache.rebuilt).toBe(true);
      expect(
        (await api.ws.listProjects()).map(p => [
          p.slug,
          p.files.map(f => [f.path, f.hash, f.valid]),
        ]),
      ).toEqual(before.map(p => [p.slug, p.files.map(f => [f.path, f.hash, f.valid])]));
      expect(api.ws.grouping(id)).toEqual(grouping);
      expect(api.ws.state.draft('shop', 'shop.yaml')!.text).toBe('unsaved draft');
      await a.reload();
      await expect(
        a
          .getByRole('tree', { name: 'Projects' })
          .getByRole('treeitem', { name: 'Shop', exact: true }),
      ).toBeVisible();
      await expect(fileButton(a, 'added.yaml')).toBeVisible();
    },
  );
  if (errors.length) throw Error('Browser errors: ' + errors.join('\n'));
  console.log(`${passed} project checks passed on isolated data root ${api.root}.`);
} finally {
  await browser.close();
  await api.stop();
}
