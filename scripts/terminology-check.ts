// Checks metric terminology in the UI and documentation while allowing verbatim user data.
import { chromium, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
// Rendered text and documentation use metric terminology. Verbatim example content and stored keys
// such as `kpi_bindings` are allowed.
const api = await startIsolatedApi();
const loaded: Record<string, { slug: string; name: string }> = {};
for (const id of ['mall', 'flights', 'commerce', 'mapped-commerce', 'billing'])
  loaded[id] = await api.ws.loadExample(id);
const sources = readdirSync('public/examples', { recursive: true, withFileTypes: true })
  .filter(f => f.isFile() && /\.(ya?ml|json|ttl|owl|sql)$/.test(f.name))
  .map(f => readFileSync(`${f.parentPath}/${f.name}`, 'utf8'))
  .join('\n');
const KPI = /KPI/;
const allowed = (text: string) => {
  const t = text.trim();
  return !KPI.test(t.replace(/kpi_bindings/g, '')) || (t.length > 3 && sources.includes(t));
};
const found = new Map<string, Set<string>>();
async function scan(p: Page, where: string) {
  const texts: string[] = await p.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest('.cm-editor,script,style')) continue;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      if (n.textContent?.trim()) out.push(n.textContent);
    }
    for (const el of document.querySelectorAll(
      '[aria-label],[title],[placeholder],[aria-description]',
    ))
      for (const a of ['aria-label', 'title', 'placeholder', 'aria-description']) {
        const v = el.getAttribute(a);
        if (v && !el.closest('.cm-editor')) out.push(v);
      }
    return out;
  });
  for (const t of texts)
    if (!allowed(t)) {
      const k = t.trim().slice(0, 120);
      (found.get(k) ?? found.set(k, new Set()).get(k)!).add(where);
    }
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
await routeApi(page, api);
const tree = () => page.getByRole('tree', { name: 'Projects' });
const tab = (name: RegExp | string) => page.locator('.tabs').getByRole('button', { name });
async function openFile(project: string, path: string) {
  await tree()
    .getByRole('treeitem', { name: project })
    .getByRole('button', { name: path, exact: true })
    .click();
  await page.waitForTimeout(400);
}
async function visitTabs(where: string) {
  for (const name of [
    'Overview',
    'Graph',
    'Neighborhood',
    'Catalog',
    'Source',
    'Mappings',
    /^Metrics/,
    'Contract',
  ]) {
    const t = tab(name as any);
    if (!(await t.count())) continue;
    await t.first().click();
    await page.waitForTimeout(700);
    await scan(page, `${where} · ${String(name)}`);
  }
}
try {
  await page.goto(process.env.UI_URL ?? 'http://127.0.0.1:5173/');
  await page.waitForTimeout(800);
  await scan(page, 'start');
  const files: [string, string][] = [
    ['mall', 'mall.ontology.yaml'],
    ['mall', 'mall.semantic.yaml'],
    ['mall', 'mall.mapping.yaml'],
    ['mall', 'mall.odcs.yaml'],
    ['flights', 'flights.yaml'],
    ['flights', 'flights.semantic_model.yaml'],
    ['commerce', 'sales.ossie.yaml'],
    ['mapped-commerce', 'commerce.mapping.yaml'],
  ];
  for (const [p, f] of files) {
    await openFile(loaded[p].name, f);
    await visitTabs(f);
  }
  // Metric detail, its explanation, the new-metric wizard on the shopping center.
  await openFile(loaded.mall.name, 'mall.semantic.yaml');
  await tab(/^Metrics/).click();
  await page.waitForTimeout(800);
  const explain = page.getByRole('button', { name: /: explain$/ }).first();
  if (await explain.count()) {
    await explain.click();
    await page.waitForTimeout(800);
    await scan(page, 'metric detail');
  }
  const neu = page.locator('.metrics-new');
  if (await neu.count()) {
    await neu.click();
    await page.waitForTimeout(500);
    for (let i = 0; i < 8; i++) {
      await scan(page, `wizard step ${i + 1}`);
      const next = page.getByRole('dialog').getByRole('button', { name: 'Next' });
      if (!(await next.count()) || (await next.isDisabled())) break;
      await next.click();
      await page.waitForTimeout(300);
    }
    await page.keyboard.press('Escape');
  }
  // Graph and Neighborhood switches, details panel of a measured concept.
  await openFile(loaded.mall.name, 'mall.ontology.yaml');
  await tab('Neighborhood').click();
  await page.waitForTimeout(800);
  await scan(page, 'mall neighborhood');
  const readme = [
    readFileSync('README.md', 'utf8'),
    ...readdirSync('docs')
      .filter(f => f.endsWith('.md'))
      .map(f => readFileSync(`docs/${f}`, 'utf8')),
  ]
    .join('\n')
    .split('\n');
  for (const line of readme)
    if (KPI.test(line.replace(/kpi_bindings/g, ''))) {
      const k = line.trim().slice(0, 120);
      (found.get(k) ?? found.set(k, new Set()).get(k)!).add('README/docs');
    }
  if (found.size) {
    console.log(`${found.size} texts say "KPI":`);
    for (const [t, w] of found) console.log(`  "${t}"  ← ${[...w].slice(0, 3).join('; ')}`);
    throw Error('Terminology check failed.');
  }
  if (errors.length) throw Error(errors.join('\n'));
  console.log(
    `Terminology check passed: no "KPI" in ${files.length} files' views, the metric detail, the wizard, README and docs (isolated data root ${api.root}).`,
  );
} finally {
  await browser.close();
  await api.stop();
}
