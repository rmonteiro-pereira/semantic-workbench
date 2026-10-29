// Checks project navigation, external changes and stale saves in an isolated browser workspace.
import { LOCAL_READER } from '../src/server/projects/reader';
import { appUrl } from './helpers/base-url';
import { chromium, expect } from '@playwright/test';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expectEditorValue, fillEditor } from './helpers/code-editor';
import { geometryProblems } from './helpers/screen-tour';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { sha256 } from '../src/server/projects/atomic';
import { addProjectItem } from './helpers/sidebar-menus';
import { readZip } from '../tests/helpers/zip-reader';
// Browser check: project tree, live refresh after external edits, two-tab stale save, cache
// deletion and restart. Runs against an isolated temporary data root.
const api = await startIsolatedApi();
const shop = '# shop ontology\nname: Shop\nontology:\n  - concept: Customer\n    type: EntityType\n    description: A buyer.\n';
await api.ws.importBatch(
  {
    files: [
      { path: 'shop.yaml', source: shop },
      {
        path: 'models/ref.ttl',
        source: '@prefix ex: <https://example.org/> .\nex:a ex:b ex:c .\n',
      },
    ],
  },
  LOCAL_READER,
);
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
const fileButton = (page: any, path: string) => page.getByRole('tree', { name: 'Projects' }).getByRole('button', { name: path, exact: true });
const sourceText = (page: any) => page.getByLabel('Definition source');
try {
  const a = await openPage();
  await check('sidebar tree lists projects with their files, types and validity', async () => {
    const tree = a.getByRole('tree', { name: 'Projects' });
    await expect(tree.getByRole('treeitem', { name: 'Shop', exact: true })).toBeVisible();
    await expect(tree.getByRole('treeitem', { name: 'Mapped commerce', exact: true })).toBeVisible();
    await expect(tree.getByRole('treeitem', { name: 'shop.yaml', exact: true })).toContainText('Ossie ontology');
    await expect(tree.getByRole('treeitem', { name: 'models/ref.ttl', exact: true })).toContainText('RDF');
    await expect(tree.getByRole('treeitem', { name: 'broken.yaml', exact: true })).toContainText('invalid');
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
    writeFileSync(join(api.root, 'projects/shop/added.yaml'), 'name: Added\nontology: [{concept: Added}]\n');
    await expect(fileButton(a, 'added.yaml')).toBeVisible({ timeout: 2000 });
  });
  await check('a save based on an older version is rejected with both versions shown (two tabs)', async () => {
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
    await expect.poll(() => readFileSync(join(api.root, 'projects/shop/shop.yaml'), 'utf8')).toContain('Saved from tab A.');
    holding = false;
    release();
    const dialog = b.getByRole('dialog', { name: /shop\.yaml changed since you opened it/ });
    await expect(dialog).toBeVisible({ timeout: 5000 });
    const diff = dialog.getByRole('group', { name: 'Your version and the current file' });
    await expect(diff).toContainText('Edited in tab B.');
    await expect(diff).toContainText('Saved from tab A.');
    await expect(diff.locator('.cm-changedLine').first()).toBeVisible();
    await b.screenshot({ path: '/tmp/workbench-projects-stale.png' });
    expect(readFileSync(join(api.root, 'projects/shop/shop.yaml'), 'utf8')).toContain('Saved from tab A.');
    // Keep editing: automatic saving of the file stays paused until the user chooses.
    await dialog.getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialog).toHaveCount(0);
    await expectEditorValue(sourceText(b), /Edited in tab B\./);
    await expect(b.getByRole('status', { name: 'Save state' })).toHaveText('Not saved: file changed on disk');
    await b.waitForTimeout(1500);
    expect(readFileSync(join(api.root, 'projects/shop/shop.yaml'), 'utf8')).toContain('Saved from tab A.');
    await b.getByRole('status', { name: 'Save state' }).click();
    await b.getByRole('dialog').getByRole('button', { name: 'Discard my edits and load the current file' }).click();
    await expectEditorValue(sourceText(b), /Saved from tab A\./);
    await b.route(
      '**/api/projects/shop/files/shop.yaml',
      async route => {
        if (route.request().method() === 'PUT') appendFileSync(join(api.root, 'projects/shop/shop.yaml'), '# another external change\n');
        await route.fallback();
      },
      { times: 1 },
    );
    await fillEditor(sourceText(b), base.replace('A buyer.', 'Second edit in B.'));
    await b.getByRole('dialog').getByRole('button', { name: 'Keep my version and save over it' }).click({ timeout: 5000 });
    await expect(b.getByRole('status', { name: 'Save state' })).toHaveText(/^Saved to file/, {
      timeout: 5000,
    });
    expect(readFileSync(join(api.root, 'projects/shop/shop.yaml'), 'utf8')).toBe(base.replace('A buyer.', 'Second edit in B.'));
    await expectEditorValue(sourceText(a), base.replace('A buyer.', 'Second edit in B.'), {
      timeout: 2000,
    });
    await b.close();
  });
  await check('deleting the cache and restarting restores projects, files, view settings and drafts', async () => {
    const id = 'shop/shop.yaml';
    const grouping = {
      mode: 'types',
      assignments: { 'ontology/0': 'custom:Review' },
      names: { 'custom:Review': 'Review' },
    };
    await api.ws.saveGrouping(id, grouping, LOCAL_READER);
    api.ws.state.writeDraft('shop', 'shop.yaml', {
      baseHash: null,
      text: 'unsaved draft',
      patches: [],
    });
    const before = await api.ws.listProjects(LOCAL_READER);
    await api.restart({ deleteCache: true });
    expect(api.ws.cache.rebuilt).toBe(true);
    expect((await api.ws.listProjects(LOCAL_READER)).map(p => [p.slug, p.files.map(f => [f.path, f.hash, f.valid])])).toEqual(before.map(p => [p.slug, p.files.map(f => [f.path, f.hash, f.valid])]));
    expect(api.ws.grouping(id, LOCAL_READER)).toEqual(grouping);
    expect(api.ws.state.draft('shop', 'shop.yaml')!.text).toBe('unsaved draft');
    await a.reload();
    await expect(a.getByRole('tree', { name: 'Projects' }).getByRole('treeitem', { name: 'Shop', exact: true })).toBeVisible();
    await expect(fileButton(a, 'added.yaml')).toBeVisible();
  });
  await check('export project downloads a zip that imports back byte-exact', async () => {
    const oddContract = readFileSync('tests/fixtures/auth-workspace/projects/sales-contracts/orders.odcs.yaml', 'utf8');
    const files = [
      { path: 'orders.odcs.yaml', source: '# kept\r\n' + oddContract.replaceAll('\n', '\r\n') },
      { path: 'models/flights.ontology.yaml', source: shop },
      { path: '.gitignore', source: '*.log\n' },
    ];
    const { slug } = await api.ws.importBatch({ files, name: 'Export source' }, LOCAL_READER);
    writeFileSync(join(api.root, 'projects', slug, 'debug.log'), 'ignored');
    api.ws.state.writeDraft(slug, 'orders.odcs.yaml', {
      baseHash: null,
      text: 'x: [',
      patches: [],
    });
    await a.reload();
    const openExport = async () => {
      await a.getByRole('button', { name: 'Actions for Export source', exact: true }).click();
      await a.getByRole('menuitem', { name: 'Export project…' }).click();
      return a.getByRole('dialog', { name: 'Export Export source' });
    };
    const dialog = await openExport();
    await expect(dialog.getByLabel('Include Git history')).not.toBeChecked();
    await expect(dialog).toContainText('These unsaved edits are not in the export');
    await expect(dialog).toContainText('orders.odcs.yaml');
    expect(await geometryProblems(a, 'dialog[open]')).toEqual([]);
    const downloading = a.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(`${slug}.zip`);
    const stored = readZip(new Uint8Array(readFileSync((await download.path())!)));
    expect([...stored.keys()].sort()).toEqual(files.map(file => file.path).sort());
    const imported = await api.handler(
      new Request('http://127.0.0.1:4310/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Export round trip',
          files: [...stored].map(([path, bytes]) => ({
            path,
            source: new TextDecoder().decode(bytes),
          })),
        }),
      }),
    );
    expect(imported.status).toBe(200);
    const copy = (await imported.json()).slug;
    for (const file of files) {
      const original = sha256(new TextEncoder().encode(file.source));
      expect(api.ws.readFile(copy, file.path).hash, file.path).toBe(original);
      expect(sha256(stored.get(file.path)!), file.path).toBe(original);
    }
    await expect(a.getByText(/Exported 3 files of Export source/)).toBeVisible();
    // With the history option the zip also holds a Git bundle.
    await openExport();
    await a.getByLabel('Include Git history').check();
    const withHistory = a.waitForEvent('download');
    await a.getByRole('dialog').getByRole('button', { name: 'Export', exact: true }).click();
    const historyZip = readZip(new Uint8Array(readFileSync((await (await withHistory).path())!)));
    expect(historyZip.has('git-history.bundle')).toBe(true);
  });
  await check('the selected project is the context: fallbacks and Import stay in it, never in another project', async () => {
    const ontology = (name: string) => `name: ${name}\nontology:\n  - concept: Item\n    type: EntityType\n`;
    await api.ws.importBatch({ name: 'Alpha', files: [{ path: 'alpha.yaml', source: ontology('Alpha') }] }, LOCAL_READER);
    const beta = await api.ws.importBatch(
      {
        name: 'Beta',
        files: [
          { path: 'one.yaml', source: ontology('Beta one') },
          { path: 'two.yaml', source: ontology('Beta two') },
        ],
      },
      LOCAL_READER,
    );
    const page = await openPage();
    const tree = page.getByRole('tree', { name: 'Projects' });
    const chosenFile = tree.locator('button.document.chosen');
    const inBeta = tree.getByRole('treeitem', { name: 'Beta', exact: true });
    // Start-up opens a file of the first project, which is not Beta.
    await expect(chosenFile).toHaveCount(1);
    await expect(inBeta.locator('button.document.chosen')).toHaveCount(0);
    await tree.getByRole('button', { name: 'Beta', exact: true }).click();
    await expect(inBeta.locator('button.document.chosen')).toHaveText('one.yaml');
    // Import into an existing project starts on the selected project.
    await (await addProjectItem(page, 'Import files')).click();
    const dialog = page.getByRole('dialog', { name: 'Import' });
    await dialog.getByRole('radio', { name: /An existing project/ }).check();
    await expect(dialog.getByRole('combobox', { name: 'Project' })).toHaveValue(beta.slug);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    // Deleting the open file opens the next file of Beta, not a file of the first project.
    await api.ws.deleteFile(beta.slug, 'one.yaml', LOCAL_READER);
    await expect(inBeta.locator('button.document.chosen')).toHaveText('two.yaml');
    await expect(chosenFile).toHaveCount(1);
    // With Beta empty the app shows Beta's empty state and opens nothing else.
    await api.ws.deleteFile(beta.slug, 'two.yaml', LOCAL_READER);
    await expect(chosenFile).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Beta has no definitions' })).toBeVisible();
    await page.close();
  });
  if (errors.length) throw Error('Browser errors: ' + errors.join('\n'));
  console.log(`${passed} project checks passed on isolated data root ${api.root}.`);
} finally {
  await browser.close();
  await api.stop();
}
