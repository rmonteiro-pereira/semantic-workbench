// Captures every shopping center document view using an isolated temporary workspace.
import { appUrl } from './helpers/base-url';
import { example } from './helpers/examples';
import { chromium, expect } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { expectModelName, headerTitle } from './helpers/header';
// Opens every shopping-center document in every applicable view against an isolated temporary data
// root, records what renders, and saves screenshots.
const out = process.argv[2] ?? '/tmp/mall-inspect';
const api = await startIsolatedApi({ watch: false });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const problems: string[] = [];
page.on('pageerror', e => problems.push('pageerror: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`console ${m.type()}: ${m.text().slice(0, 300)}`);
});
await routeApi(page, api);
const report: any[] = [];
const shot = async (name: string) => page.screenshot({ path: `${out}/${name}.png` });
const tab = async (name: string) => {
  const b = page.locator('.tabs').getByRole('button', { name, exact: true });
  if (!(await b.count())) return false;
  await b.click();
  await page.waitForTimeout(600);
  return true;
};
try {
  await page.goto(appUrl());
  await (await example(page, /Shopping center administration/)).click();
  await expectModelName(page, /Shopping center administration ontology/, { timeout: 30000 });
  for (const file of ['mall.ontology.yaml', 'mall.semantic.yaml', 'mall.mapping.yaml', 'mall.odcs.yaml', 'mall.owl.ttl', 'mall.shacl.ttl', 'mall-data.ttl']) {
    const key = file.replace(/\W/g, '_');
    const entry: any = { file, tabs: {} };
    report.push(entry);
    await page.getByRole('button', { name: file, exact: true }).click();
    await page.waitForTimeout(800);
    entry.title = (await headerTitle(page).getAttribute('title')) ?? '';
    entry.footer = (
      await page
        .locator('footer')
        .innerText()
        .catch(() => '')
    ).replace(/\s+/g, ' ');
    entry.tabNames = await page.locator('.tabs button').allInnerTexts();
    if (await tab('Overview')) {
      entry.tabs.overview = {
        groups: await page.locator('.area-grid h3').count(),
        entities: await page.locator('.area-entities button').count(),
        heading: await page
          .locator('h2')
          .first()
          .innerText()
          .catch(() => ''),
      };
      await shot(key + '-1-overview');
    }
    if (await tab('Graph')) {
      await expect(page.locator('.full-graph-loading'))
        .toHaveCount(0, { timeout: 90000 })
        .catch(() => problems.push(file + ': graph still loading'));
      const st = page.locator('.full-graph-status');
      entry.tabs.graph = {
        entities: await st.getAttribute('data-entity-count').catch(() => null),
        relationships: await st.getAttribute('data-relationship-count').catch(() => null),
        nodes: await page.locator('.react-flow__node').count(),
        edges: await page.locator('.react-flow__edge').count(),
      };
      const fit = page.getByRole('button', { name: 'Fit model', exact: true });
      if (await fit.count()) {
        await fit.click();
        await page.waitForTimeout(500);
      }
      await shot(key + '-2-graph');
    }
    if (await tab('Neighborhood')) {
      await page.waitForTimeout(500);
      const nodes = page.locator('.react-flow__node');
      entry.tabs.neighborhood = {
        nodes: await nodes.count(),
        edges: await page.locator('.react-flow__edge').count(),
        labels: (await nodes.allInnerTexts()).map(t => t.split('\n')[0]).slice(0, 10),
      };
      await shot(key + '-3-neighborhood');
      // Navigate: click a non-centre node and check the neighborhood re-centres on it.
      if ((await nodes.count()) > 1) {
        const target = nodes.nth(1);
        const label = (await target.innerText()).split('\n')[0];
        await target.click();
        await page.waitForTimeout(400);
        const dbl = page.getByRole('button', { name: /Center|Explore|Focus/i }).first();
        if (await dbl.count()) await dbl.click().catch(() => {});
        else await target.dblclick().catch(() => {});
        await page.waitForTimeout(700);
        entry.tabs.neighborhood.navigatedTo = label;
        entry.tabs.neighborhood.afterNav = {
          nodes: await nodes.count(),
          inspector: await page
            .locator('.inspector h2')
            .innerText()
            .catch(() => null),
        };
        await shot(key + '-4-neighborhood-nav');
      }
    }
    if (await tab('Catalog')) {
      entry.tabs.catalog = {
        rows: await page.locator('table tbody tr, .catalog li, .catalog-row').count(),
      };
      await shot(key + '-5-catalog');
    }
    if (await tab('Source')) {
      entry.tabs.source = {
        chars: (
          await page
            .locator('textarea, .cm-content')
            .first()
            .innerText()
            .catch(
              async () =>
                await page
                  .locator('textarea')
                  .first()
                  .inputValue()
                  .catch(() => ''),
            )
        ).length,
      };
      await shot(key + '-6-source');
    }
    if (await tab('Mappings')) {
      entry.tabs.mappings = {
        text: (
          await page
            .locator('.mapping-layer-chain')
            .innerText()
            .catch(() => '')
        )
          .replace(/\s+/g, ' ')
          .slice(0, 200),
      };
      await shot(key + '-7-mappings');
    }
    const details = page.getByRole('button', { name: 'Validation details', exact: true });
    if (await details.count()) {
      await details.click();
      await page.waitForTimeout(300);
      entry.validation = (
        await page
          .locator('.validation-panel, [role=dialog]')
          .first()
          .innerText()
          .catch(() => '')
      )
        .replace(/\s+/g, ' ')
        .slice(0, 500);
      await shot(key + '-8-validation');
      await page.keyboard.press('Escape');
    }
  }
} finally {
  console.log(JSON.stringify({ report, problems }, null, 1));
  await browser.close();
  await api.stop();
}
