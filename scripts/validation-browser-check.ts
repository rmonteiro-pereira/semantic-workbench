// Checks in the browser that validation is honest: bundled files show nothing to report, shapes run against a data file, and an unknown Ossie version is "Not validated".
import { appUrl } from './helpers/base-url';
import { chromium } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { example } from './helpers/examples';
import { join } from 'node:path';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
const api = await startIsolatedApi({ watch: false });
await routeApi(page, api);
await page.goto(appUrl());
await (await example(page, /Commerce workspace/)).click();
await page.getByRole('status').filter({ hasText: 'Loaded commerce contracts' }).waitFor({ timeout: 60000 });

const footer = page.locator('footer');
const validationDialog = page.getByRole('dialog', { name: 'Validation details' });

async function openValidationDetails() {
  await footer.getByRole('button', { name: /^Validation details/ }).click();
  await validationDialog.waitFor();
}

async function closeValidationDetails() {
  await validationDialog.getByRole('button', { name: 'Close' }).click();
}

// Every bundled file reports no findings at all.
for (const filename of ['sales.ossie.yaml', 'commerce-business.ossie.yaml', 'commerce.owl.ttl', 'commerce.shacl.ttl']) {
  await page.getByRole('button', { name: filename, exact: true }).click();
  await footer.getByText('Structure checked').waitFor();
  await openValidationDetails();
  await validationDialog.getByText('0 errors · 0 warnings').waitFor();
  if (filename === 'commerce.shacl.ttl') {
    await validationDialog.getByRole('combobox', { name: 'Data file' }).selectOption({ label: 'commerce-data.ttl' });
    await validationDialog.getByRole('button', { name: 'Run shapes on commerce-data.ttl' }).click();
    await validationDialog.getByText('No problems in commerce-data.ttl').waitFor({ timeout: 60000 });
  }
  await closeValidationDetails();
}

// A shapes file run against data with a known violation lists the node and the rule.
// Extra files are written into the commerce project's folder, then the page reloads to list them.
const projectFolder = join(api.root, 'projects', api.ws.documents().find(doc => doc.filename === 'commerce.shacl.ttl')!.project);
const violatingData = '@prefix c: <https://example.org/commerce#> .\nc:order_9 a c:Order .\n';
const unknownVersion = 'version: "0.3.1"\nname: later\nontology:\n  - concept: Order\n';
await Bun.write(join(projectFolder, 'broken-data.ttl'), violatingData);
await Bun.write(join(projectFolder, 'later.ontology.yaml'), unknownVersion);
await api.restart({ deleteCache: true });
await page.reload();
await page.getByRole('button', { name: 'broken-data.ttl', exact: true }).waitFor({ timeout: 60000 });
await page.getByRole('button', { name: 'commerce.shacl.ttl', exact: true }).click();
await openValidationDetails();
await validationDialog.getByRole('combobox', { name: 'Data file' }).selectOption({ label: 'broken-data.ttl' });
await validationDialog.getByRole('button', { name: 'Run shapes on broken-data.ttl' }).click();
await validationDialog.getByText('https://example.org/commerce#order_9').first().waitFor({ timeout: 60000 });
await validationDialog.getByText('sh:minCount on c:amount').waitFor();
await closeValidationDetails();

// A version the app has no schema for is not validated, said once. Its structure is sound, so there are no per-line findings until the schema runs.
await page.getByRole('button', { name: 'later.ontology.yaml', exact: true }).click();
await page.locator('.tabs').getByRole('button', { name: 'Source', exact: true }).click();
const notice = page.getByLabel('Document-level findings');
await notice.getByText('Not validated — this app checks Ossie 0.2.0.dev0, the file says 0.3.1.').waitFor();
await footer.getByText('Not validated').waitFor();
if ((await page.locator('.cm-lintRange').count()) !== 0) throw Error('A structurally sound unvalidated file must show no per-line findings');
await notice.getByRole('button', { name: 'Validate as Ossie 0.2.0.dev0' }).click();
await page.locator('.cm-lintRange-error').first().waitFor();

console.log(JSON.stringify({ errors }));
if (errors.length) throw Error(errors.join('\n'));
await browser.close();
await api.stop();
