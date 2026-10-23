// Checks grouping, deletion, undo and trash recovery in an isolated browser workspace.
import { appUrl } from './helpers/base-url';
import { chromium, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { treeRowProblems } from './helpers/tree-geometry';
import { expectEditorValue, fillEditor } from './helpers/code-editor';
import { LOCAL_READER } from '../server/projects/reader';
// Browser check: suggestions accept/dismiss, delete with confirmation, undo, trash restore and
// purge, project delete, Clear, without any page reload. Runs against an isolated temporary data
// root.
const api = await startIsolatedApi();
const read = (path: string) => Bun.file('public/examples/ossie/' + path).text();
await api.ws.importBatch(
  {
    name: 'Flights',
    files: await Promise.all(
      ['flights.ontology.yaml', 'flights.semantic_model.yaml'].map(async path => ({
        path,
        source: await read(path),
      })),
    ),
  },
  LOCAL_READER,
);
const longName =
  'a-deliberately-long-definition-filename-that-must-ellipsize-before-the-icons.yaml';
await api.ws.importBatch(
  {
    name: 'Scratch',
    files: [
      { path: 'scratch.yaml', source: 'name: Scratch\nontology: [{concept: Note}]\n' },
      { path: longName, source: 'name: Long\nontology: [{concept: Long}]\n' },
    ],
  },
  LOCAL_READER,
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
let loads = 0;
page.on('load', () => loads++);
let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log('PASS', name);
}
const tree = () => page.getByRole('tree', { name: 'Projects' });
const fileButton = (path: string) => tree().getByRole('button', { name: path, exact: true });
async function menu(label: string, item: string) {
  await page.getByRole('button', { name: `Actions for ${label}`, exact: true }).click();
  await page
    .getByRole('menu', { name: `Actions for ${label}` })
    .getByRole('menuitem', { name: item, exact: true })
    .click();
}
const toast = () => page.locator('.undo-toast');
try {
  await routeApi(page, api);
  await page.goto(appUrl());
  await expect(tree()).toBeVisible();
  await check(
    'row delete icons stay hidden until hover or focus (muted on the open file), red on icon hover, with a tooltip',
    async () => {
      const icon = page.getByRole('button', { name: 'Delete scratch.yaml', exact: true });
      await page.mouse.move(900, 500);
      await expect(icon).toHaveCSS('opacity', '0');
      await expect(icon).toHaveAttribute('title', 'Delete scratch.yaml');
      await fileButton('scratch.yaml').hover();
      await expect(icon).toHaveCSS('opacity', '1');
      await icon.hover();
      await expect(icon).toHaveCSS('color', 'rgb(179, 38, 30)');
      const box = (await icon.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(28);
      expect(box.height).toBeGreaterThanOrEqual(28);
      await expect(
        page.getByRole('button', { name: 'Delete project Scratch', exact: true }),
      ).toHaveAttribute('title', 'Delete project Scratch');
      await page.mouse.move(900, 500);
      await page.getByRole('button', { name: 'Delete project Scratch', exact: true }).focus();
      await expect(
        page.getByRole('button', { name: 'Delete project Scratch', exact: true }),
      ).toHaveCSS('opacity', '1');
      await fileButton('scratch.yaml').hover();
      await page.screenshot({
        path: '/tmp/workbench-trash-row-icons.png',
        clip: { x: 0, y: 0, width: 300, height: 500 },
      });
    },
  );
  await check(
    'keyboard: Tab from a file reaches its delete icon and Enter opens the confirmation',
    async () => {
      await fileButton(longName).focus();
      await page.keyboard.press('Tab');
      await expect(page.locator(':focus')).toHaveAttribute('aria-label', `Delete ${longName}`);
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: `Delete ${longName}?` });
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(fileButton(longName)).toBeVisible();
    },
  );
  await check(
    'the row icon runs the same confirmation, undo and trash flow for a single file',
    async () => {
      await page.getByRole('button', { name: `Delete ${longName}`, exact: true }).click();
      await page
        .getByRole('dialog', { name: `Delete ${longName}?` })
        .getByRole('button', { name: 'Delete', exact: true })
        .click();
      await expect(fileButton(longName)).toHaveCount(0);
      expect(existsSync(join(api.root, 'projects/scratch', longName))).toBe(false);
      await toast().getByRole('button', { name: 'Undo' }).click();
      await expect(fileButton(longName)).toBeVisible();
      expect(existsSync(join(api.root, 'projects/scratch', longName))).toBe(true);
      await expect(toast()).toHaveCount(0);
    },
  );
  await check(
    'rows never overlap or run under the icons at 390 px and 2560 px; touch shows the icons without hover',
    async () => {
      for (const [width, height, touch] of [
        [390, 844, false],
        [2560, 1440, false],
        [390, 844, true],
      ] as const) {
        const context = await browser.newContext({
          viewport: { width, height },
          hasTouch: touch,
          isMobile: touch,
        });
        const p = await context.newPage();
        try {
          p.on('pageerror', e => errors.push(`${width}: ${e.message}`));
          await routeApi(p, api);
          await p.goto(appUrl());
          if (width < 1100)
            await p.getByRole('button', { name: 'Open workspace', exact: true }).click();
          const icon = p.getByRole('button', { name: 'Delete scratch.yaml', exact: true });
          await expect(icon).toBeVisible();
          expect(await treeRowProblems(p)).toEqual([]);
          const long = p
            .getByRole('tree', { name: 'Projects' })
            .getByRole('button', { name: longName, exact: true })
            .locator('span');
          // Long names wrap to at most two lines and keep the full name as a tooltip.
          if (width === 390) {
            expect(await long.getAttribute('title')).toBe(longName);
            expect(
              await long.evaluate(
                el =>
                  el.getBoundingClientRect().height <=
                  2 * parseFloat(getComputedStyle(el).lineHeight) + 1,
              ),
            ).toBe(true);
          }
          if (touch) await expect(icon).toHaveCSS('opacity', '1');
          await p.screenshot({
            path: `/tmp/workbench-trash-rows-${width}${touch ? '-touch' : ''}.png`,
          });
        } finally {
          await context.close();
        }
      }
    },
  );
  await check(
    'a mapping imported on its own is suggested for Flights with evidence, and accepting moves it',
    async () => {
      await page.locator('input[type=file]').setInputFiles({
        name: 'flights.mapping.yaml',
        mimeType: 'application/yaml',
        buffer: Buffer.from(await read('flights.mapping.yaml')),
      });
      // A one-line count in the sidebar opens the Grouping suggestions dialog.
      await page.getByRole('button', { name: '1 grouping suggestion' }).click();
      const region = page.getByRole('dialog', { name: 'Grouping suggestions' });
      await expect(region).toContainText('flights.mapping.yaml');
      await expect(region).toContainText('references "Flights"');
      await page.screenshot({ path: '/tmp/workbench-trash-suggestion.png' });
      await region.getByRole('button', { name: 'Add to project' }).click();
      await expect(region).toHaveCount(0);
      await expect(page.getByRole('button', { name: /grouping suggestion/ })).toHaveCount(0);
      await expect(
        tree()
          .getByRole('treeitem', { name: 'Flights', exact: true })
          .getByRole('button', { name: 'flights.mapping.yaml', exact: true }),
      ).toBeVisible();
      expect(existsSync(join(api.root, 'projects/flights/flights.mapping.yaml'))).toBe(true);
    },
  );
  await check('a dismissed suggestion is not offered again', async () => {
    await page.locator('input[type=file]').setInputFiles({
      name: 'flights.semantic_model.yaml',
      mimeType: 'application/yaml',
      buffer: Buffer.from(await read('flights.semantic_model.yaml')),
    });
    await page.getByRole('button', { name: '1 grouping suggestion' }).click();
    const region = page.getByRole('dialog', { name: 'Grouping suggestions' });
    await expect(region).toBeVisible();
    await region.getByRole('button', { name: 'Dismiss' }).click();
    await expect(region).toHaveCount(0);
    expect(api.ws.state.suggestions().rejected).toHaveLength(1);
  });
  await check(
    'delete names the file, warns about unsaved edits and broken references; Cancel keeps it',
    async () => {
      await fileButton('flights.ontology.yaml').first().click();
      await page.locator('.tabs').getByRole('button', { name: 'Source', exact: true }).click();
      await fillEditor(
        page.getByLabel('Definition source'),
        (await read('flights.ontology.yaml')) + '# unsaved\n',
      );
      await menu('flights.ontology.yaml in Flights', 'Delete');
      const dialog = page.getByRole('dialog', { name: 'Delete flights.ontology.yaml?' });
      await expect(dialog).toContainText('flights.ontology.yaml in Flights');
      await expect(dialog).toContainText('Unsaved edits will be lost');
      await expect(dialog).toContainText('flights.mapping.yaml (Flights) refers to "Flights"');
      await page.screenshot({ path: '/tmp/workbench-trash-confirm.png' });
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expectEditorValue(page.getByLabel('Definition source'), /# unsaved/);
      expect(existsSync(join(api.root, 'projects/flights/flights.ontology.yaml'))).toBe(true);
    },
  );
  await check(
    'confirmed delete updates every view; Undo within 10 s restores the exact file',
    async () => {
      await menu('flights.ontology.yaml in Flights', 'Delete');
      await page
        .getByRole('dialog', { name: 'Delete flights.ontology.yaml?' })
        .getByRole('button', { name: 'Delete', exact: true })
        .click();
      await expect(toast()).toContainText('Deleted flights.ontology.yaml');
      await expect(
        tree()
          .getByRole('treeitem', { name: 'Flights', exact: true })
          .getByRole('button', { name: 'flights.ontology.yaml', exact: true }),
      ).toHaveCount(0);
      await expectEditorValue(page.getByLabel('Definition source'), /# unsaved/, { not: true });
      await toast().getByRole('button', { name: 'Undo' }).click();
      await expect(
        tree()
          .getByRole('treeitem', { name: 'Flights', exact: true })
          .getByRole('button', { name: 'flights.ontology.yaml', exact: true }),
      ).toBeVisible();
      expect(await Bun.file(join(api.root, 'projects/flights/flights.ontology.yaml')).text()).toBe(
        await read('flights.ontology.yaml'),
      );
    },
  );
  await check(
    'after the undo window the file is restored from the trash, and another is purged',
    async () => {
      await menu('scratch.yaml in Scratch', 'Delete');
      await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(toast()).toBeVisible();
      await expect(toast()).toHaveCount(0, { timeout: 12000 });
      await page.getByRole('button', { name: 'Trash', exact: true }).click();
      const trash = page.getByRole('dialog', { name: 'Trash' });
      await expect(trash).toContainText('scratch.yaml (Scratch)');
      await trash.getByRole('button', { name: 'Restore' }).click();
      await expect(trash).toContainText('Nothing here yet');
      await expect(trash).toContainText('Deleted projects and files stay here');
      await expect(trash.getByRole('button', { name: 'Empty trash' })).toHaveCount(0);
      await trash.getByRole('button', { name: 'Close' }).click();
      await expect(fileButton('scratch.yaml')).toBeVisible();
      await menu('scratch.yaml in Scratch', 'Delete');
      await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
      await page.getByRole('button', { name: 'Trash', exact: true }).click();
      await trash.getByRole('button', { name: 'Delete permanently' }).click();
      await trash.getByRole('button', { name: 'Yes, delete' }).click();
      await expect(trash).toContainText('Nothing here yet');
      await trash.getByRole('button', { name: 'Close' }).click();
      expect(api.ws.trash.list()).toEqual([]);
    },
  );
  await check(
    'deleting a project removes it with its history; restore from the trash brings it back',
    async () => {
      await menu('Flights', 'Delete');
      const dialog = page.getByRole('dialog', { name: 'Delete project Flights?' });
      await expect(dialog).toContainText('including its Git history');
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(tree().getByRole('treeitem', { name: 'Flights', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Trash', exact: true }).click();
      const trash = page.getByRole('dialog', { name: 'Trash' });
      await expect(trash).toContainText('Project Flights');
      await trash.getByRole('button', { name: 'Restore' }).click();
      await trash.getByRole('button', { name: 'Close' }).click();
      await expect(tree().getByRole('treeitem', { name: 'Flights', exact: true })).toBeVisible();
      expect(existsSync(join(api.root, 'projects/flights/.git/HEAD'))).toBe(true);
    },
  );
  await check('Clear empties the workspace; Undo brings every project back', async () => {
    const before = api.ws.state
      .registry()
      .projects.map(p => p.slug)
      .sort();
    await page.getByRole('button', { name: 'Clear workspace', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Clear workspace?' });
    await expect(dialog).toContainText('Flights');
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('No projects yet.')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('Semantic Workbench');
    await page.screenshot({ path: '/tmp/workbench-trash-cleared.png' });
    await toast().getByRole('button', { name: 'Undo' }).click();
    await expect(tree().getByRole('treeitem', { name: 'Flights', exact: true })).toBeVisible();
    expect(
      api.ws.state
        .registry()
        .projects.map(p => p.slug)
        .sort(),
    ).toEqual(before);
  });
  await check('Clear again, then empty the trash with confirmation', async () => {
    await page.getByRole('button', { name: 'Clear workspace', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('No projects yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Trash', exact: true }).click();
    const trash = page.getByRole('dialog', { name: 'Trash' });
    await trash.getByRole('button', { name: 'Empty trash' }).click();
    await expect(trash).toContainText('Permanently delete all');
    await trash.getByRole('button', { name: 'Empty trash' }).click();
    await expect(trash).toContainText('Nothing here yet');
    expect(api.ws.trash.list()).toEqual([]);
  });
  await check('no page reload and no browser errors', async () => {
    expect(loads).toBe(1);
    expect(errors).toEqual([]);
  });
  console.log(`${passed} trash checks passed on isolated data root ${api.root}.`);
} finally {
  await browser.close();
  await api.stop();
}
