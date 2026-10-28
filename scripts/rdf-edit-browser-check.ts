// Checks RDF item editing and refusal of edits that would change other resources.
import { appUrl } from './helpers/base-url';
import { chromium, expect, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Parser, Writer } from 'n3';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { projectDir, projectFile } from '../src/server/projects/paths';
import { editorValue, fillEditor } from './helpers/code-editor';
import { expectFileOpen, newItem } from './helpers/header';
import { LOCAL_READER } from '../src/server/projects/reader';
// RDF edits must change only the selected resource statements. Unsupported rules and edits
// spanning other resources must be refused with a link to Source.
const api = await startIsolatedApi();
const commerce = await api.ws.loadExample('commerce');
const mall = await api.ws.loadExample('mall');
const ttl = readFileSync('public/examples/commerce/commerce.owl.ttl', 'utf8');
const nt = (() => {
  const w = new Writer({ format: 'N-Triples' });
  w.addQuads(new Parser({ baseIRI: 'https://workbench.local/import/' }).parse(ttl));
  let out = '';
  w.end((_e: any, r: string) => {
    out = r;
  });
  return out;
})();
const rule =
  '{ ?x a <https://example.org/commerce#PaidOrder> } => { ?x a <https://example.org/commerce#Order> } .\n';
const imported = await api.ws.importBatch(
  {
    name: 'RDF formats',
    files: [
      { path: 'commerce.owl.nt', source: nt },
      { path: 'commerce.n3', source: ttl + '\n' + rule },
    ],
  },
  LOCAL_READER,
);
const read = (slug: string, path: string) =>
  readFileSync(projectFile(api.ws.layout, slug, path), 'utf8');
const git = async (slug: string, args: string[]) =>
  (await api.ws.git.run(projectDir(api.ws.layout, slug), args)).stdout;
async function changed(slug: string, path: string) {
  const d = await git(slug, ['diff', '-U0', '--', path]);
  return {
    removed: d
      .split('\n')
      .filter(l => /^-(?!--)/.test(l))
      .map(l => l.slice(1)),
    added: d
      .split('\n')
      .filter(l => /^\+(?!\+\+)/.test(l))
      .map(l => l.slice(1)),
    hunks: d.split('\n').filter(l => l.startsWith('@@')).length,
  };
}
const commit = (slug: string, message: string) =>
  api.ws.git.run(projectDir(api.ws.layout, slug), ['commit', '-qam', message]);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
});
await routeApi(page, api);
let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  const t = Date.now();
  await run();
  passed++;
  console.log('PASS', name, `(${((Date.now() - t) / 1000).toFixed(1)} s)`);
}
const tree = () => page.getByRole('tree', { name: 'Projects' });
async function openFile(path: string) {
  await tree().getByRole('button', { name: path, exact: true }).first().click();
  await expectFileOpen(page);
}
const tabs = () => page.locator('.tabs');
const editor = (name: string) => page.getByRole('dialog', { name: `Edit ${name}` });
async function catalogEdit(name: string) {
  await tabs().getByRole('button', { name: 'Catalog' }).click();
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  const d = editor(name);
  await expect(d).toBeVisible();
  return d;
}
const card = (name: string) =>
  page
    .locator('.catalog-card')
    .filter({ has: page.locator('strong', { hasText: new RegExp(`^${name}$`) }) })
    .first()
    .locator('button')
    .first()
    .click();
// The statement row whose object reads `text` (1-based, as the row labels count).
async function row(d: Locator, text: string) {
  const values = await d
    .locator('[aria-label^="Object "]')
    .evaluateAll(els => els.map(e => (e as HTMLInputElement).value));
  const i = values.indexOf(text);
  expect(i, `row ${text} in ${values.join(' | ')}`).toBeGreaterThanOrEqual(0);
  return i + 1;
}
async function saveDialog(d: Locator) {
  await expect(d.getByRole('button', { name: 'Save to file', exact: true })).toBeEnabled({
    timeout: 5000,
  });
  await d.getByRole('button', { name: 'Save to file', exact: true }).click();
  await expect(d).toHaveCount(0, { timeout: 5000 });
}
try {
  await page.goto(appUrl());
  await check(
    'Turtle (catalog → Edit): changing one object rewrites only that statement line',
    async () => {
      await openFile('commerce.owl.ttl');
      const d = await catalogEdit('Customer');
      await expect(d.locator('.item-subject')).toHaveText('https://example.org/commerce#Customer');
      const n = await row(d, '"Customer in the order-to-cash process."');
      await d
        .getByLabel(`Object ${n}`, { exact: true })
        .fill('"Person or company that buys from us."');
      await expect(d.locator('.item-gate')).toContainText('1 triple removed, 1 added');
      await page.screenshot({ path: '/tmp/workbench-rdf-turtle.png' });
      await saveDialog(d);
      expect(await changed(commerce.slug, 'commerce.owl.ttl')).toEqual({
        removed: [
          'c:Customer a owl:Class ; rdfs:label "Customer" ; rdfs:comment "Customer in the order-to-cash process." .',
        ],
        added: [
          'c:Customer a owl:Class ; rdfs:label "Customer" ; rdfs:comment "Person or company that buys from us." .',
        ],
        hunks: 1,
      });
      await expect(page.locator('main > .status')).toContainText('Saved to commerce.owl.ttl');
      await commit(commerce.slug, 'turtle edit');
    },
  );
  await check(
    "Turtle (inspector, E key): adding a statement goes into the resource's own block",
    async () => {
      await tabs().getByRole('button', { name: 'Catalog' }).click();
      await card('Order');
      await expect(page.getByRole('complementary', { name: 'Definition details' })).toBeVisible();
      await page.keyboard.press('e');
      const d = page.getByRole('dialog', { name: /^Edit / });
      await expect(d).toBeVisible();
      const subject = await d.locator('.item-subject').textContent();
      expect(subject).toMatch(/^https:\/\/example\.org\/commerce#/);
      const before = await d.locator('[aria-label^="Object "]').count();
      await d.getByRole('button', { name: 'Add statement' }).click();
      await d.getByLabel(`Predicate ${before + 1}`).fill('rdfs:seeAlso');
      await d
        .getByLabel(`Object ${before + 1}`, { exact: true })
        .fill('<https://example.org/docs/order>');
      await expect(d.locator('.item-gate')).toContainText('0 triples removed, 1 added');
      await saveDialog(d);
      const c = await changed(commerce.slug, 'commerce.owl.ttl');
      expect(c.hunks).toBe(1);
      expect(c.removed.length).toBe(1);
      expect(c.added.length).toBe(1);
      expect(c.added[0]).toBe(
        c.removed[0].replace(/ \.$/, ' ; rdfs:seeAlso <https://example.org/docs/order> .'),
      );
      await commit(commerce.slug, 'turtle add statement');
    },
  );
  await check(
    'Turtle Source tab: an edit that changes another resource is refused and Save stays off',
    async () => {
      const d = await catalogEdit('Customer');
      await d.getByRole('tab', { name: 'Source' }).click();
      const source = d.getByRole('textbox', { name: 'Source of Customer' });
      const fragment = await editorValue(source);
      expect(fragment.startsWith('c:Customer a owl:Class')).toBe(true);
      expect(fragment).not.toContain('c:Order a');
      await fillEditor(source, fragment + '\nc:Order rdfs:label "Purchase order" .');
      await expect(
        d.getByRole('alert').filter({ hasText: 'change statements of other resources' }),
      ).toBeVisible({ timeout: 5000 });
      await expect(d.getByRole('button', { name: 'Save to file', exact: true })).toBeDisabled();
      await page.screenshot({ path: '/tmp/workbench-rdf-refused.png' });
      await fillEditor(
        source,
        fragment.replace('rdfs:label "Customer"', 'rdfs:label "Customer" , "Client"@en'),
      );
      await saveDialog(d);
      const c = await changed(commerce.slug, 'commerce.owl.ttl');
      expect(c.hunks).toBe(1);
      expect(c.added[0]).toContain('rdfs:label "Customer" , "Client"@en ;');
      await commit(commerce.slug, 'turtle source fragment');
    },
  );
  await check(
    'RDF/XML: a label edit changes one property element, the node element stays in place',
    async () => {
      await openFile('commerce.owl');
      const d = await catalogEdit('Customer');
      await expect(d.getByLabel('Predicate 1')).toBeDisabled();
      const n = await row(d, '"Customer"');
      await d.getByLabel(`Object ${n}`, { exact: true }).fill('"Client"');
      await d.getByRole('button', { name: 'Add statement' }).click();
      const m = await d.locator('[aria-label^="Object "]').count();
      await d.getByLabel(`Predicate ${m}`).fill('rdfs:seeAlso');
      await d
        .getByLabel(`Object ${m}`, { exact: true })
        .fill('<https://example.org/docs/customer>');
      await page.screenshot({ path: '/tmp/workbench-rdf-xml.png' });
      await saveDialog(d);
      expect(await changed(commerce.slug, 'commerce.owl')).toEqual({
        removed: ['        <rdfs:label>Customer</rdfs:label>'],
        added: [
          '        <rdfs:label>Client</rdfs:label>',
          '        <rdfs:seeAlso rdf:resource="https://example.org/docs/customer"/>',
        ],
        hunks: 1,
      });
      await commit(commerce.slug, 'rdfxml edit');
    },
  );
  await check(
    'N-Triples: an edit replaces whole lines and every other line keeps its bytes',
    async () => {
      await openFile('commerce.owl.nt');
      const d = await catalogEdit('Invoice');
      const n = await row(d, '"Invoice in the order-to-cash process."');
      await d.getByLabel(`Object ${n}`, { exact: true }).fill('"Bill sent to the customer."');
      await saveDialog(d);
      expect(await changed(imported.slug, 'commerce.owl.nt')).toEqual({
        removed: [
          '<https://example.org/commerce#Invoice> <http://www.w3.org/2000/01/rdf-schema#comment> "Invoice in the order-to-cash process." .',
        ],
        added: [
          '<https://example.org/commerce#Invoice> <http://www.w3.org/2000/01/rdf-schema#comment> "Bill sent to the customer." .',
        ],
        hunks: 1,
      });
      await commit(imported.slug, 'nt edit');
    },
  );
  await check(
    'N3: a resource used in a rule is refused, with a jump to the rule in Source',
    async () => {
      await openFile('commerce.n3');
      const d = await catalogEdit('PaidOrder');
      const note = d.locator('.item-refusal');
      await expect(note).toContainText('N3 formula or rule');
      await expect(d.getByRole('alert').filter({ hasText: 'N3 formula or rule' })).toHaveCount(1);
      await expect(d.getByRole('button', { name: 'Save to file', exact: true })).toBeDisabled();
      await expect(d.getByRole('button', { name: 'Add statement' })).toBeDisabled();
      await page.screenshot({ path: '/tmp/workbench-rdf-n3-refused.png' });
      await note.getByRole('button', { name: /^Open line \d+ in Source$/ }).click();
      await expect(d).toHaveCount(0);
      await expect(page.locator('.cm-activeLine')).toContainText('=>');
      // Other resources of the same N3 file are still editable.
      await openFile('commerce.n3');
      const e = await catalogEdit('Warehouse');
      const n = await row(e, '"Warehouse"');
      await e.getByLabel(`Object ${n}`, { exact: true }).fill('"Depot"');
      await saveDialog(e);
      const c = await changed(imported.slug, 'commerce.n3');
      expect(c.hunks).toBe(1);
      expect(c.added[0]).toContain('rdfs:label "Depot"');
      expect(read(imported.slug, 'commerce.n3').endsWith(rule)).toBe(true);
    },
  );
  await check(
    'SHACL (mall): removing one sh:property object keeps the rest of the shape and file',
    async () => {
      await openFile('mall.shacl.ttl');
      const d = await catalogEdit('Party requirements');
      const n = await row(d, 'core:Party_phoneShape');
      await d.getByRole('button', { name: `Remove statement ${n}` }).click();
      await expect(d.locator('.item-gate')).toContainText('1 triple removed, 0 added');
      await page.screenshot({ path: '/tmp/workbench-rdf-shacl.png' });
      await saveDialog(d);
      expect(await changed(mall.slug, 'mall.shacl.ttl')).toEqual({
        removed: ['    core:Party_phoneShape ,'],
        added: [],
        hunks: 1,
      });
    },
  );
  await check(
    'add an OWL class, refer to it, then delete it with its dependents: the file is back to its last commit',
    async () => {
      await openFile('commerce.owl.ttl');
      const before = read(commerce.slug, 'commerce.owl.ttl');
      await newItem(page, /^Add RDF resource/);
      const a = page.getByRole('dialog', { name: /^Add to commerce\.owl\.ttl/ });
      await a.getByLabel('Item type').selectOption('class');
      await a.getByLabel('IRI').fill('c:Supplier');
      await a.getByLabel('Label').fill('Supplier');
      await a.getByLabel('Subclass of').fill('c:Customer');
      await expect(a.getByLabel('Text to insert')).toHaveText(
        'c:Supplier a owl:Class ; rdfs:label "Supplier" ; rdfs:subClassOf c:Customer .\n',
      );
      await page.screenshot({ path: '/tmp/workbench-rdf-add.png' });
      await a.getByRole('button', { name: 'Save to file' }).click();
      await expect(a).toHaveCount(0, { timeout: 5000 });
      await expect(page.getByRole('complementary', { name: 'Definition details' })).toContainText(
        'Supplier',
      );
      const d = await catalogEdit('Product');
      await d.getByRole('button', { name: 'Add statement' }).click();
      const m = await d.locator('[aria-label^="Object "]').count();
      await d.getByLabel(`Predicate ${m}`).fill('rdfs:seeAlso');
      await d.getByLabel(`Object ${m}`, { exact: true }).fill('c:Supplier');
      await saveDialog(d);
      await tabs().getByRole('button', { name: 'Catalog' }).click();
      await card('Supplier');
      await page
        .getByRole('complementary', { name: 'Definition details' })
        .getByRole('button', { name: 'Delete Supplier' })
        .click();
      const del = page.getByRole('dialog', { name: 'Delete Supplier?' });
      await expect(del.locator('.delete-list')).toContainText('rdfs:seeAlso');
      await page.screenshot({ path: '/tmp/workbench-rdf-delete.png' });
      await del.getByRole('button', { name: 'Delete' }).click();
      await expect(del).toHaveCount(0);
      await expect.poll(() => read(commerce.slug, 'commerce.owl.ttl')).toBe(before);
      expect(await git(commerce.slug, ['status', '--porcelain', '--', 'commerce.owl.ttl'])).toBe(
        '',
      );
    },
  );
  await check('no browser errors', async () => {
    expect(errors).toEqual([]);
  });
  console.log(`${passed} rdf-edit checks passed on isolated data root ${api.root}.`);
} finally {
  await browser.close();
  await api.stop();
}
