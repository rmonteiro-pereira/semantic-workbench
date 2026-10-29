// Server-mode checks of the project export: a Sales Viewer exports a project that holds a
// restricted folder, receives only the files they may read, and the audit log records it.
import assert from 'node:assert/strict';
import { expect, type Browser } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readZip } from '../../tests/helpers/zip-reader';
import { fixtureFiles, leakMarker } from '../../tests/helpers/auth-workspace';
import { expectDialogGeometry } from './dialog-geometry';
import { authViewports, check, signIn, type SignInTarget } from './sign-in';

const PROJECT = 'sales-contracts';
const RESTRICTED = 'finance/revenue-recognition.odcs.yaml';

function auditActions(dataRoot: string) {
  const directory = join(dataRoot, 'state', 'audit');
  return readdirSync(directory)
    .filter(name => name.endsWith('.jsonl'))
    .flatMap(name => readFileSync(join(directory, name), 'utf8').trim().split('\n'))
    .map(line => JSON.parse(line))
    .filter(entry => entry.action === 'export');
}

/** Alice must already be narrowed to the Sales Viewers group, as in the read visibility check. */
export async function exportProjectChecks(browser: Browser, target: SignInTarget, dataRoot: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const viewer = {
      roleId: 'viewer',
      name: 'Viewer',
      via: 'group' as const,
      reason: 'Sales Viewer must come from the group grant',
    };
    await signIn(page, target, 'alice', viewer);
    await check('a viewer exports a project and receives only the files they may read', async () => {
      const before = auditActions(dataRoot).length;
      await page.getByRole('button', { name: `Actions for ${PROJECT}`, exact: true }).click();
      await page.getByRole('menuitem', { name: 'Export project' }).click();
      const dialog = page.getByRole('dialog', { name: `Export ${PROJECT}` });
      await expect(dialog).toBeVisible();
      for (const [width, height] of authViewports) {
        await page.setViewportSize({ width, height });
        await expectDialogGeometry(page, `project-export at ${width}×${height}`);
      }
      const downloading = page.waitForEvent('download');
      await dialog.getByRole('button', { name: 'Export', exact: true }).click();
      const archive = new Uint8Array(readFileSync((await (await downloading).path())!));
      const stored = readZip(archive);
      const readable = fixtureFiles(PROJECT).filter(file => file.path !== RESTRICTED);
      assert.deepEqual([...stored.keys()].sort(), readable.map(file => file.path).sort());
      const everything = new TextDecoder('latin1').decode(archive);
      assert(!everything.includes(leakMarker(PROJECT, RESTRICTED)), 'restricted bytes exported');
      assert(!everything.includes('revenue-recognition'), 'restricted name exported');
      await expect(page.getByText(/Left out: 1 file you cannot read/)).toBeVisible();
      assert.equal(auditActions(dataRoot).length, before + 1, 'export is audited once');
      const entry = auditActions(dataRoot).at(-1);
      assert.equal(entry.decision, 'allow');
      assert.equal(entry.outcome, 'ok');
      assert.deepEqual(entry.resource, { type: 'project', project: PROJECT });
    });
    await check('Git history is refused for a person who cannot read every file', async () => {
      const response = await context.request.get(`${target.url}/api/projects/${PROJECT}/export?history=1`);
      assert.equal(response.status(), 400);
      assert(!(await response.text()).includes('finance'));
    });
  } finally {
    await context.close();
  }
}
