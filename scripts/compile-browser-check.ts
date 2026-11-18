// Checks in the browser that a person can review what a compile drops, accept that exact report and download the standard files, that the working copy is only checked, and that no project file changes.
import { chromium, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCAL_READER } from '../src/server/projects/reader';
import { MAPPING_TEXT, ONTOLOGY_TEXT, SEMANTIC_MODEL_TEXT } from '../tests/helpers/tessera-repository';
import { readZip } from '../tests/helpers/zip-reader';
import { appUrl } from './helpers/base-url';
import { clippedTextProblems } from './helpers/clipped-text';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { layoutProblems } from './helpers/layout-geometry';
import { openProjectMenuItem } from './helpers/project-dialog-tour';

const ONTOLOGY = 'retail.ontology.yaml';
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

// The workspace is a temporary data root, so the real workspace is never touched.
const api = await startIsolatedApi({ watch: false });
const files = [
  { path: ONTOLOGY, source: ONTOLOGY_TEXT },
  { path: 'retail.semantic.yaml', source: SEMANTIC_MODEL_TEXT },
  { path: 'retail.mapping.yaml', source: MAPPING_TEXT },
];
const { slug } = await api.ws.importBatch({ name: 'Retail', files }, LOCAL_READER);
await api.ws.publish(slug, LOCAL_READER);
const downloads = mkdtempSync(join(tmpdir(), 'compile-downloads-'));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: DESKTOP, acceptDownloads: true });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
await routeApi(page, api);

/** The hash of every project file, without Git's own folder, so the check can prove nothing changed. */
function projectHashes(): Map<string, string> {
  const hashes = new Map<string, string>();
  const visit = (directory: string, prefix: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(join(directory, entry.name), path);
      else
        hashes.set(
          path,
          createHash('sha256')
            .update(readFileSync(join(directory, entry.name)))
            .digest('hex'),
        );
    }
  };
  visit(join(api.root, 'projects'), '');
  return hashes;
}

async function expectNoSidewaysScroll(label: string) {
  const overflow = await page.evaluate(() => {
    const dialog = document.querySelector('dialog[open] .workbench-dialog');
    return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, dialog: dialog ? dialog.scrollWidth - dialog.clientWidth : 0 };
  });
  expect(overflow.page, `${label}: page scrolls sideways`).toBeLessThanOrEqual(0);
  expect(overflow.dialog, `${label}: dialog scrolls sideways`).toBeLessThanOrEqual(0);
  expect(await layoutProblems(page), `${label}: layout`).toEqual([]);
  expect(await clippedTextProblems(page, 'dialog[open]'), `${label}: clipped text`).toEqual([]);
}

async function openStandardReview(target: Page) {
  await openProjectMenuItem(target, ONTOLOGY, 'Export project…');
  const exportDialog = target.getByRole('dialog', { name: /^Export / });
  await exportDialog.getByLabel('Files to export').selectOption('standard');
  await exportDialog.getByRole('button', { name: 'Review standard Ossie' }).click();
  await target.getByRole('dialog', { name: 'Standard Ossie for Retail' }).waitFor();
}

try {
  const before = projectHashes();
  await page.goto(appUrl());

  // The review shows what is dropped before anything can be accepted or downloaded.
  await openStandardReview(page);
  const dialog = page.getByRole('dialog', { name: 'Standard Ossie for Retail' });
  await expect(dialog.getByText('3 values will be dropped')).toBeVisible();
  await expect(dialog.getByText('Accepting a report is not approval of the content')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Download zip' })).toHaveCount(0);
  await dialog.getByText('tessera_notes', { exact: true }).click();
  await expect(dialog.getByText('retail.ontology.yaml').first()).toBeVisible();
  await expectNoSidewaysScroll('review on desktop');

  // The same dialog holds together on a phone, and the accept action stays reachable.
  await page.setViewportSize(PHONE);
  await expect(dialog.getByRole('button', { name: 'Accept this report' })).toBeVisible();
  await expectNoSidewaysScroll('review on a phone');
  await page.setViewportSize(DESKTOP);

  // Accepting that report releases the download, and the zip holds standard files and the manifest.
  await dialog.getByRole('button', { name: 'Accept this report' }).click();
  await expect(dialog.getByText('Accepted. The standard files are ready to download.')).toBeVisible();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download zip' }).click();
  const file = await download;
  const archive = join(downloads, file.suggestedFilename());
  await file.saveAs(archive);
  const zip = readZip(new Uint8Array(readFileSync(archive)));
  expect([...zip.keys()]).toEqual(expect.arrayContaining([ONTOLOGY, 'manifest.json', 'loss-report.json']));
  expect(new TextDecoder().decode(zip.get(ONTOLOGY)!)).not.toContain('tessera');
  expect(JSON.parse(new TextDecoder().decode(zip.get('manifest.json')!)).loss.accepted).toBe('digest');
  await expectNoSidewaysScroll('released');

  // The working copy is only checked: it is labelled unpublished and offers no download.
  await dialog.getByLabel('Compile from').selectOption('working');
  await expect(dialog.getByText('Unpublished: this checks the saved files in your working copy.')).toBeVisible();
  await expect(dialog.getByText('Your working copy compiles. This is what would be dropped.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Download zip' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Accept this report' })).toHaveCount(0);
  await expectNoSidewaysScroll('working copy check');
  await dialog.getByRole('button', { name: 'Close' }).click();

  expect(projectHashes(), 'no project file changed').toEqual(before);
  if (errors.length) throw Error(errors.join('\n'));
  console.log('PASS a project is reviewed, accepted and downloaded as standard Ossie in the browser');
} finally {
  await browser.close();
  await api.stop();
  rmSync(downloads, { recursive: true, force: true });
}
