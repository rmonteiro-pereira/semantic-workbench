// Checks several projects in one repository from the browser: projects from a manifest or a
// confirmed choice, the grouped tree, the shared Source Control, and Remove versus Delete folder.
// Every repository is a local bare repository in a temporary folder.
import { appUrl } from './helpers/base-url';
import { expectDialogGeometry } from './helpers/dialog-geometry';
import { chromium, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { sh } from '../tests/helpers/scm';
import { bareRepository, ontologyText } from '../tests/helpers/git-fixtures';
import { addProjectItem } from './helpers/sidebar-menus';

const api = await startIsolatedApi();
const declared = bareRepository('monorepo');
const undeclared = bareRepository('monorepo-no-manifest');
const repo = join(api.root, 'projects', 'monorepo');
const financeFile = join(repo, 'domains/finance/finance.ontology.yaml');
const VIEWPORTS = [
  [390, 844],
  [1280, 720],
  [1440, 900],
  [2560, 1440],
] as const;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
await routeApi(page, api);
let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log('PASS', name);
}
const tree = () => page.getByRole('tree', { name: 'Projects' });
const repositoryRow = (name: string) =>
  tree().getByRole('treeitem', { name: `Repository ${name}`, exact: true });
const panel = () => page.getByRole('region', { name: 'Source Control' });
const slugOf = (name: string) =>
  api.ws.state.registry().projects.find(entry => entry.name === name)?.slug;

async function clone(target: Page, address: string) {
  await (await addProjectItem(target, 'Clone a repository')).click();
  const dialog = target.getByRole('dialog', { name: 'Clone repository' });
  await dialog.getByLabel('Repository URL or path').fill(address);
  await dialog.getByRole('button', { name: 'Clone', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Cloned.', { timeout: 20_000 });
  return dialog;
}

async function openRepositoryProjects(name: string) {
  await repositoryRow(name)
    .getByRole('button', { name: `Actions for Repository ${name}` })
    .click();
  await page.getByRole('menuitem', { name: 'Projects in this repository…' }).click();
  const dialog = page.getByRole('dialog', { name: `Projects in ${name}` });
  await expect(dialog.getByRole('list', { name: 'Folders' })).toBeVisible();
  return dialog;
}

async function openDelete(project: string) {
  await tree()
    .getByRole('button', { name: `Delete project ${project}`, exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: /^(Remove|Delete) project/ });
  await expect(dialog.getByRole('group')).toBeVisible();
  return dialog;
}

// The dialog stays inside the window and the page never scrolls sideways.
async function expectFits(dialog: ReturnType<Page['getByRole']>, width: number) {
  const box = (await dialog.locator('.workbench-dialog').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

try {
  await page.goto(appUrl());
  await check('a manifest makes Sales and Finance, grouped under their repository', async () => {
    const dialog = await clone(page, declared.bare);
    const made = dialog.getByRole('region', { name: 'Projects made' });
    await expect(made.getByRole('listitem')).toHaveText(['Sales', 'Finance']);
    await page.screenshot({ path: '/tmp/workbench-monorepo-clone.png' });
    await dialog.getByRole('button', { name: 'Open project' }).click();
    await expect(dialog).toHaveCount(0);
    const group = repositoryRow('monorepo');
    await expect(group).toBeVisible();
    await expect(group.getByRole('treeitem', { name: 'Sales', exact: true })).toBeVisible();
    await expect(group.getByRole('treeitem', { name: 'Finance', exact: true })).toBeVisible();
    await expect(tree().getByRole('treeitem', { name: 'monorepo', exact: true })).toHaveCount(0);
  });
  await check(
    "Source Control shows the whole repository and names each file's project",
    async () => {
      writeFileSync(financeFile, ontologyText('Finance', ['Invoice']));
      await expect(
        tree().getByRole('treeitem', { name: 'finance.ontology.yaml' }).locator('.file-meta'),
      ).toContainText('modified', { timeout: 10_000 });
      await page.getByRole('button', { name: /^Source control/ }).click();
      await expect(panel()).toBeVisible();
      const row = panel().locator('.scm-row').filter({ hasText: 'finance.ontology.yaml' });
      await expect(row.locator('.scm-project')).toHaveText('Finance');
      await page.screenshot({ path: '/tmp/workbench-monorepo-scm.png' });
      await row.getByRole('button', { name: /^Stage / }).click();
      await expect
        .poll(() => sh(repo, ['diff', '--cached', '--name-only']).trim())
        .toBe('domains/finance/finance.ontology.yaml');
      await page.getByRole('button', { name: 'Commit…' }).click();
      const commit = page.getByRole('dialog', { name: 'Commit' });
      await expect(commit.getByRole('list', { name: 'Changed files' })).toContainText(
        'domains/finance/finance.ontology.yaml',
      );
      await commit.getByRole('button', { name: 'Commit', exact: true }).click();
      await expect(commit).toHaveCount(0);
      expect(sh(repo, ['status', '--porcelain'])).toBe('');
    },
  );
  await check(
    'Remove from workspace is the default for a subfolder and deletes nothing',
    async () => {
      const dialog = await openDelete('Sales');
      await expect(dialog.getByRole('radio', { name: /Remove from workspace/ })).toBeChecked();
      await page.screenshot({ path: '/tmp/workbench-monorepo-remove.png' });
      await dialog.getByRole('button', { name: 'Remove from workspace' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(tree().getByRole('treeitem', { name: 'Sales', exact: true })).toHaveCount(0);
      expect(existsSync(join(repo, 'domains/sales/sales.ontology.yaml'))).toBe(true);
      expect(sh(repo, ['status', '--porcelain'])).toBe('');
    },
  );
  await check('Projects in this repository brings a folder back as a project', async () => {
    const dialog = await openRepositoryProjects('monorepo');
    const sales = dialog.getByRole('checkbox', { name: 'domains/sales' });
    await expect(sales).not.toBeChecked();
    await sales.check();
    await dialog.getByLabel('Project name for domains/sales').fill('Sales');
    await page.screenshot({ path: '/tmp/workbench-monorepo-projects.png' });
    await dialog.getByRole('button', { name: 'Save projects' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      repositoryRow('monorepo').getByRole('treeitem', { name: 'Sales', exact: true }),
    ).toBeVisible();
  });
  await check('Delete folder moves only that subfolder to the trash', async () => {
    const dialog = await openDelete('Finance');
    await dialog.getByRole('radio', { name: /Delete folder/ }).check();
    await expect(dialog.getByRole('heading', { name: 'Moved to trash' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(existsSync(join(repo, 'domains/finance'))).toBe(false);
    expect(readFileSync(join(repo, 'domains/sales/sales.ontology.yaml'), 'utf8')).toContain(
      'Customer',
    );
    expect(sh(repo, ['status', '--porcelain']).trim()).toBe(
      'D domains/finance/finance.ontology.yaml',
    );
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(
      repositoryRow('monorepo').getByRole('treeitem', { name: 'Finance', exact: true }),
    ).toBeVisible();
    expect(sh(repo, ['status', '--porcelain'])).toBe('');
  });
  await check('without a manifest, Choose projects proposes the definition folders', async () => {
    const dialog = await clone(page, undeclared.bare);
    await expect(dialog).toContainText('2 folders hold definitions.');
    await dialog.getByRole('button', { name: 'Choose projects…' }).click();
    const chooser = page.getByRole('dialog', { name: 'Projects in monorepo-no-manifest' });
    await expect(chooser.getByRole('checkbox', { name: 'domains/finance' })).toBeChecked();
    await expect(chooser.getByRole('checkbox', { name: 'domains/sales' })).toBeChecked();
    await expect(
      chooser.getByRole('checkbox', { name: 'The whole repository as one project' }),
    ).not.toBeChecked();
    await chooser.getByRole('button', { name: 'Save projects' }).click();
    await expect(chooser).toHaveCount(0);
    const group = repositoryRow('monorepo-no-manifest');
    // Names come from the folders and never repeat a project name already in the workspace.
    await expect(group.getByRole('treeitem', { name: 'sales (2)', exact: true })).toBeVisible();
    await expect(group.getByRole('treeitem', { name: 'finance (2)', exact: true })).toBeVisible();
    expect(slugOf('monorepo-no-manifest')).toBeUndefined();
  });
  await check('the repository dialogs fit at 390, 1280, 1440 and 2560 px', async () => {
    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await page.goto(appUrl());
      if (width < 1100)
        await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
      const chooser = await openRepositoryProjects('monorepo');
      await expectFits(chooser, width);
      await expectDialogGeometry(page, 'projects-in-repository');
      await page.screenshot({ path: `/tmp/workbench-monorepo-projects-${width}.png` });
      await chooser.getByRole('button', { name: 'Cancel' }).click();
      // Opening a dialog closes the phone drawer; the delete button lives in the tree.
      if (width < 1100)
        await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
      const remove = await openDelete('Sales');
      await expectFits(remove, width);
      await expectDialogGeometry(page, 'remove-project');
      await page.screenshot({ path: `/tmp/workbench-monorepo-delete-${width}.png` });
      await remove.getByRole('button', { name: 'Cancel' }).click();
    }
  });
  await check('browser has no uncaught runtime errors', async () => expect(errors).toEqual([]));
  console.log(`${passed} monorepo checks passed on isolated data root ${api.root}.`);
} finally {
  await browser.close();
  await api.stop();
  declared.dispose();
  undeclared.dispose();
}
