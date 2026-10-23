// Checks dialog fit, focus trapping and dismissal across supported viewports.
import { appUrl } from './helpers/base-url';
import { chromium, expect, type Page } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { LOCAL_READER } from '../server/projects/reader';
// Dialogs must fit six viewports, trap focus and return focus to their trigger after Escape.
// Screenshots use /tmp/workbench-dialog-*.png.
const api = await startIsolatedApi();
const mall = await api.ws.loadExample('mall');
const commerce = await api.ws.loadExample('commerce');
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
  open: (p: Page) => Promise<void>;
  trigger: (p: Page) => ReturnType<Page['getByRole']>;
  returns?: (p: Page) => ReturnType<Page['getByRole']>;
};
const tree = (p: Page) => p.getByRole('tree', { name: 'Projects' });
const narrow = (p: Page) => p.viewportSize()!.width < 1100;
// On a narrow screen the app may open a document right after loading, which closes the drawer
// the check has just opened, so the drawer is opened again until the tree shows.
async function workspace(p: Page) {
  if (!narrow(p)) {
    await expect(tree(p)).toBeVisible();
    return;
  }
  await expect(async () => {
    if (!(await tree(p).isVisible()))
      await p.getByRole('button', { name: 'Open workspace', exact: true }).click();
    await expect(tree(p)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
}
async function openFile(p: Page, project: string, path: string) {
  await workspace(p);
  await tree(p)
    .getByRole('treeitem', { name: project })
    .getByRole('button', { name: path, exact: true })
    .click();
  if (narrow(p)) {
    await p.waitForTimeout(300);
    const close = p.getByRole('button', { name: 'Close workspace', exact: true });
    if (await close.isVisible()) await close.click();
  }
}
const header = (p: Page, name: string | RegExp) =>
  p.locator('.workspace-header').getByRole('button', { name });
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
      await header(p, 'New').click();
    },
    trigger: p => p.getByRole('menuitem', { name: 'Add concept…', exact: true }),
    returns: p => header(p, 'New'),
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
    open: workspace,
    trigger: p => p.locator('#workspace-sidebar').getByRole('button', { name: /^Import/ }),
  },
  {
    name: 'View definition',
    dialog: /^Definition of /,
    open: async p => {
      await openFile(p, mall.name, 'mall.ontology.yaml');
      await p.locator('.tabs').getByRole('button', { name: 'Catalog', exact: true }).click();
      await p.locator('.catalog button').first().click();
    },
    trigger: p => p.getByRole('button', { name: 'View definition' }),
  },
  {
    name: 'Export menu',
    dialog: '',
    open: p => openFile(p, mall.name, 'mall.ontology.yaml'),
    trigger: p => header(p, 'More actions'),
  },
  {
    name: 'Lineage options',
    dialog: 'Lineage options',
    open: async p => {
      await openFile(p, commerce.name, 'commerce.odcs.yaml');
      await p.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
    },
    trigger: p => p.getByRole('button', { name: /Lineage options/ }),
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
  for (const e of entries.filter(e => !ONLY || e.name.includes(ONLY)))
    await check(
      `${e.name}: opens from its trigger, fits the six viewports, traps focus, Escape closes and returns focus`,
      async () => {
        for (const [width, height] of SIX) {
          const context = await browser.newContext({ viewport: { width, height } });
          const p = await context.newPage();
          p.on('pageerror', x => errors.push(`${e.name} ${width}: ${x.message}`));
          try {
            await routeApi(p, api);
            await p.goto(appUrl());
            await expect(p.locator('.project-tree, .projects-empty').first()).toBeAttached();
            await e.open(p);
            const trigger = e.trigger(p);
            await trigger.scrollIntoViewIfNeeded();
            await trigger.focus();
            await p.keyboard.press('Enter');
            if (!e.dialog) {
              // A menu: Export lives in More actions.
              const menu = p.getByRole('menu');
              await expect(menu).toBeVisible();
              await expect(menu.getByRole('menuitem', { name: /^Export/ })).toBeVisible();
              const box = (await menu.boundingBox())!;
              expect(
                box.x >= 0 &&
                  box.y >= 0 &&
                  box.x + box.width <= width + 1 &&
                  box.y + box.height <= height + 1,
              ).toBe(true);
              await p.keyboard.press('Escape');
              await expect(menu).toBeHidden();
              await expect(trigger).toBeFocused();
              continue;
            }
            const dialog = p.getByRole('dialog', { name: e.dialog });
            await expect(dialog).toBeVisible({ timeout: 10000 });
            // Fits: the dialog box inside the window, nothing scrolling sideways inside it.
            const fit = await dialog.evaluate(d => {
              const s = (d.querySelector('section') ?? d) as HTMLElement;
              const r = s.getBoundingClientRect();
              const wide = [s, ...s.querySelectorAll<HTMLElement>('*')]
                .filter(
                  el =>
                    el.scrollWidth > el.clientWidth + 1 &&
                    getComputedStyle(el).overflowX !== 'auto' &&
                    getComputedStyle(el).overflowX !== 'scroll' &&
                    !el.closest('pre,.cm-editor,code'),
                )
                .map(el => el.className || el.tagName);
              return { x: r.x, y: r.y, r: r.right, b: r.bottom, wide: wide.slice(0, 3) };
            });
            expect(fit.x).toBeGreaterThanOrEqual(0);
            expect(fit.y).toBeGreaterThanOrEqual(0);
            expect(fit.r).toBeLessThanOrEqual(width + 1);
            expect(fit.b).toBeLessThanOrEqual(height + 1);
            expect(fit.wide).toEqual([]);
            // Focus stays inside while tabbing.
            for (let i = 0; i < 12; i++) {
              await p.keyboard.press('Tab');
              expect(await dialog.evaluate(d => d.contains(document.activeElement))).toBe(true);
            }
            if ([390, 1280, 2560].includes(width))
              await p.screenshot({
                path: `/tmp/workbench-dialog-${e.name.toLowerCase().replace(/ /g, '-')}-${width}.png`,
              });
            await p.keyboard.press('Escape');
            await expect(dialog).toBeHidden();
            // A dialog opened from the phone drawer closes the drawer, so focus goes to the button
            // that opens it again.
            const fromDrawer = ['Grouping suggestions', 'Import', 'Trash'].includes(e.name);
            if (fromDrawer && narrow(p))
              await expect(
                p.getByRole('button', { name: 'Open workspace', exact: true }),
              ).toBeFocused();
            else await expect(e.returns ? e.returns(p) : trigger).toBeFocused();
          } finally {
            await context.close();
          }
        }
      },
    );
  if (errors.length) throw Error(errors.join('\n'));
  console.log(`${passed} dialog checks passed at six viewports on isolated data root ${api.root}.`);
} finally {
  await browser.close();
  await api.stop();
}
