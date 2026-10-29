// Checks dialog fit, focus trapping and dismissal across supported viewports.
import { appUrl } from './helpers/base-url';
import { chromium, expect, type Page } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { LOCAL_READER } from '../src/server/projects/reader';
import { menuSurfaceProblems } from './helpers/menu-geometry';
import { openNewMenu } from './helpers/header';
import { appendFileSync } from 'node:fs';
import { projectFile } from '../src/server/projects/paths';
// Dialogs must fit six viewports, trap focus and return focus to their trigger after Escape.
// Screenshots use /tmp/workbench-dialog-*.png.
const api = await startIsolatedApi();
const mall = await api.ws.loadExample('mall');
const commerce = await api.ws.loadExample('commerce');
// Commit is off while nothing has changed, so the Commit dialog needs one edited file to open from.
appendFileSync(projectFile(api.ws.layout, mall.slug, 'mall.ontology.yaml'), '\n# edited for the Commit dialog\n');
// A mapping imported on its own gives one grouping suggestion (it references Flights).
await api.ws.loadExample('flights');
await api.ws.importBatch(
  {
    files: [
      {
        path: 'flights.mapping.yaml',
        source: await Bun.file('public/examples/ossie/flights.mapping.yaml').text(),
      },
    ],
  },
  LOCAL_READER,
);
const SIX: [number, number][] = [
  [1280, 720],
  [1366, 768],
  [1920, 1080],
  [2560, 1440],
  [1024, 768],
  [390, 844],
];
type Entry = {
  name: string;
  dialog: string | RegExp;
  open: (page: Page) => Promise<void>;
  trigger: (page: Page) => ReturnType<Page['getByRole']>;
  returns?: (page: Page) => ReturnType<Page['getByRole']>;
};
const tree = (p: Page) => p.getByRole('tree', { name: 'Projects' });
const narrow = (p: Page) => p.viewportSize()!.width < 1100;
// On a narrow screen the app may open a document right after loading, which closes the drawer
// the check has just opened, so the drawer is opened again until the tree shows.
async function workspace(page: Page) {
  if (!narrow(page)) {
    await expect(tree(page)).toBeVisible();
    return;
  }
  await expect(async () => {
    if (!(await tree(page).isVisible())) await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
    await expect(tree(page)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
}
async function openFile(page: Page, project: string, path: string) {
  await workspace(page);
  await tree(page).getByRole('treeitem', { name: project }).getByRole('button', { name: path, exact: true }).click();
  if (narrow(page)) {
    await page.waitForTimeout(300);
    const close = page.getByRole('button', { name: 'Close workspace', exact: true });
    if (await close.isVisible()) await close.click();
  }
}
const header = (p: Page, name: string | RegExp) => p.locator('.workspace-header').getByRole('button', { name });
const entries: Entry[] = [
  {
    name: 'Commit',
    dialog: 'Commit',
    open: p => openFile(p, mall.name, 'mall.ontology.yaml'),
    trigger: p => header(p, /^Commit/),
  },
  {
    name: 'Validation details',
    dialog: 'Validation details',
    open: p => openFile(p, mall.name, 'mall.ontology.yaml'),
    trigger: p => p.getByRole('button', { name: /^Validation details/ }),
  },
  {
    name: 'Add concept',
    dialog: /^Add concept/,
    open: async p => {
      await openFile(p, mall.name, 'mall.ontology.yaml');
      await openNewMenu(p);
    },
    trigger: p => p.getByRole('menuitem', { name: 'Add concept…', exact: true }),
    // New sits inside More actions, which gets the focus back.
    returns: p => header(p, 'More actions'),
  },
  {
    name: 'Grouping suggestions',
    dialog: 'Grouping suggestions',
    open: workspace,
    trigger: p => p.getByRole('button', { name: /grouping suggestion/ }),
  },
  {
    name: 'Import',
    dialog: 'Import',
    open: async page => {
      await workspace(page);
      await page.getByRole('button', { name: 'Add project', exact: true }).click();
    },
    trigger: page => page.getByRole('menuitem', { name: 'Import files', exact: true }),
    returns: page => page.getByRole('button', { name: 'Add project', exact: true }),
  },
  {
    name: 'View definition',
    dialog: /^Definition of /,
    open: async page => {
      await openFile(page, mall.name, 'mall.ontology.yaml');
      await page.locator('.tabs').getByRole('button', { name: 'Catalog', exact: true }).click();
      await page.locator('.catalog button').first().click();
    },
    trigger: p => p.getByRole('button', { name: 'View definition' }),
  },
  {
    name: 'Trash',
    dialog: 'Trash',
    open: workspace,
    trigger: p => p.getByRole('button', { name: 'Trash', exact: true }),
  },
];
const browser = await chromium.launch();
const errors: string[] = [];
let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log('PASS', name);
}
const ONLY = process.env.DIALOGS_ONLY;
try {
  for (const entry of entries.filter(e => !ONLY || e.name.includes(ONLY)))
    await check(`${entry.name}: opens from its trigger, fits the six viewports, traps focus, Escape closes and returns focus`, async () => {
      for (const [width, height] of SIX) {
        const context = await browser.newContext({ viewport: { width, height } });
        const page = await context.newPage();
        page.on('pageerror', x => errors.push(`${entry.name} ${width}: ${x.message}`));
        try {
          await routeApi(page, api);
          await page.goto(appUrl());
          await expect(page.locator('.project-tree, .projects-empty').first()).toBeAttached();
          await entry.open(page);
          const trigger = entry.trigger(page);
          await trigger.scrollIntoViewIfNeeded();
          await trigger.focus();
          await page.keyboard.press('Enter');
          if (!entry.dialog) {
            // A menu: Export lives in More actions.
            const menu = page.getByRole('menu');
            await expect(menu).toBeVisible();
            await expect(menu.getByRole('menuitem', { name: /^Export/ })).toBeVisible();
            const box = (await menu.boundingBox())!;
            expect(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1).toBe(true);
            await page.keyboard.press('Escape');
            await expect(menu).toBeHidden();
            await expect(trigger).toBeFocused();
            continue;
          }
          const dialog = page.getByRole('dialog', { name: entry.dialog });
          await expect(dialog).toBeVisible({ timeout: 10000 });
          // Fits: the dialog box inside the window, nothing scrolling sideways inside it.
          const fit = await dialog.evaluate(dialogElement => {
            const element = (dialogElement.querySelector('section') ?? dialogElement) as HTMLElement;
            const rect = element.getBoundingClientRect();
            const wide = [element, ...element.querySelectorAll<HTMLElement>('*')]
              .filter(el => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'auto' && getComputedStyle(el).overflowX !== 'scroll' && !el.closest('pre,.cm-editor,code'))
              .map(el => el.className || el.tagName);
            return {
              x: rect.x,
              y: rect.y,
              r: rect.right,
              b: rect.bottom,
              wide: wide.slice(0, 3),
            };
          });
          expect(fit.x).toBeGreaterThanOrEqual(0);
          expect(fit.y).toBeGreaterThanOrEqual(0);
          expect(fit.r).toBeLessThanOrEqual(width + 1);
          expect(fit.b).toBeLessThanOrEqual(height + 1);
          expect(fit.wide).toEqual([]);
          // Focus stays inside while tabbing.
          for (let i = 0; i < 12; i++) {
            await page.keyboard.press('Tab');
            expect(await dialog.evaluate(d => d.contains(document.activeElement))).toBe(true);
          }
          if ([390, 1280, 2560].includes(width)) {
            const slug = entry.name.toLowerCase().replace(/ /g, '-');
            await page.screenshot({ path: `/tmp/workbench-dialog-${slug}-${width}.png` });
          }
          await page.keyboard.press('Escape');
          await expect(dialog).toBeHidden();
          // A dialog opened from the phone drawer closes the drawer, so focus goes to the button
          // that opens it again.
          const fromDrawer = ['Grouping suggestions', 'Import', 'Trash'].includes(entry.name);
          if (fromDrawer && narrow(page)) await expect(page.getByRole('button', { name: 'Open workspace', exact: true })).toBeFocused();
          else await expect(entry.returns ? entry.returns(page) : trigger).toBeFocused();
        } finally {
          await context.close();
        }
      }
    });
  if (!ONLY || 'menus'.includes(ONLY))
    await check('menus: opaque, inside the window and reachable at four sizes', async () => {
      const menuSizes: [number, number][] = [
        [390, 844],
        [1280, 720],
        [1440, 900],
        [2560, 1440],
      ];
      for (const [width, height] of menuSizes) {
        const context = await browser.newContext({ viewport: { width, height } });
        const page = await context.newPage();
        page.on('pageerror', x => errors.push(`menus ${width}: ${x.message}`));
        try {
          await routeApi(page, api);
          await page.goto(appUrl());
          await expect(page.locator('.project-tree, .projects-empty').first()).toBeAttached();
          await openFile(page, mall.name, 'mall.ontology.yaml');
          const openers = [
            {
              name: 'New',
              open: async () => openNewMenu(page),
            },
            {
              name: 'project',
              open: async () => {
                await workspace(page);
                await page.getByRole('button', { name: `Actions for ${commerce.name}` }).click();
              },
            },
            {
              name: 'file',
              open: async () => {
                await workspace(page);
                const label = `Actions for mall.ontology.yaml in ${mall.name}`;
                await page.getByRole('button', { name: label }).click();
              },
            },
            {
              name: 'Add project',
              open: async () => {
                await workspace(page);
                await page.getByRole('button', { name: 'Add project', exact: true }).click();
              },
            },
          ];
          for (const opener of openers) {
            await opener.open();
            await expect(page.getByRole('menu')).toBeVisible();
            expect(await menuSurfaceProblems(page), `${opener.name} menu at ${width}`).toEqual([]);
            await page.keyboard.press('Escape');
            await expect(page.getByRole('menu')).toHaveCount(0);
          }
        } finally {
          await context.close();
        }
      }
    });
  if (errors.length) throw Error(errors.join('\n'));
  console.log(`${passed} dialog checks passed at six viewports on isolated data root ${api.root}.`);
} finally {
  await browser.close();
  await api.stop();
}
