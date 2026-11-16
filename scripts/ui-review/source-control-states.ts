// Captures real source-control, draft, and local-remote states. Usage: bun scripts/ui-review/source-control-states.ts OUTPUT.
// SW_BASE_URL selects Vite. All Git commands and file changes target a temporary isolated project.
import { chromium, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { startIsolatedApi, routeApi } from '../helpers/isolated-api';
import { projectDir } from '../../src/server/projects/paths';
import { authViewports } from '../helpers/sign-in';
import { fileTab, showSidebar } from '../helpers/screen-tour';
import { openRemoteDialog, remoteDialog } from '../helpers/sync-dialog';
import { fillEditor } from '../helpers/code-editor';
import { capture, attempt, watchCaptureErrors, failure, type CaptureIdentity } from './capture-records';

const output = process.argv[2];
if (!output) throw new Error('Expected OUTPUT');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();

function git(directory: string, args: string[], allowFailure = false) {
  const result = Bun.spawnSync(['git', ...args], { cwd: directory, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode && !allowFailure) throw new Error(`Temporary fixture git ${args[0]}: ${result.stderr.toString()}`);
  return result.stdout.toString();
}

async function scm(page: Page) {
  await showSidebar(page);
  await page
    .getByRole('button', { name: /^Source control/ })
    .first()
    .click();
  await page.getByRole('region', { name: 'Source Control', exact: true }).waitFor();
  await page.waitForTimeout(500);
}

async function captureFixture(identity: CaptureIdentity) {
  const api = await startIsolatedApi();
  const project = await api.ws.loadExample('commerce');
  const directory = projectDir(api.ws.layout, project.slug);
  const file = 'commerce-business.ossie.yaml';
  const original = readFileSync(join(directory, file), 'utf8');
  const extra = mkdtempSync('/tmp/sw-capture-remote-');
  const bare = join(extra, 'remote.git');
  const page = await browser.newPage({ viewport: { width: identity.width, height: identity.height }, deviceScaleFactor: 1 });
  watchCaptureErrors(page, identity);
  page.setDefaultTimeout(4000);
  try {
    await page.addInitScript(value => localStorage.setItem('workbench.theme', value), identity.theme);
    await routeApi(page, api);
    await page.goto(process.env.SW_BASE_URL ?? 'http://127.0.0.1:5190');
    await page.waitForTimeout(1000);
    await fileTab(file, 'Overview')(page);
    await scm(page);
    await capture(page, identity, 'source-control', 'nothing-to-commit');
    await attempt(page, identity, 'source-control', 'history-list', async () => {
      await page
        .getByRole('button', { name: /^History/, exact: false })
        .first()
        .click();
    });
    await scm(page);
    writeFileSync(join(directory, file), original.replace('Customer in the order-to-cash process.', 'Customer account that placed the order.'));
    writeFileSync(join(directory, 'added.ontology.yaml'), 'name: Added model\nontology:\n  - concept: Capture\n    type: EntityType\n');
    const removed = 'sales.mapping.yaml';
    if (readFileSync(join(directory, removed), 'utf8')) unlinkSync(join(directory, removed));
    await api.ws.rescan(project.slug);
    await page.waitForTimeout(1200);
    await capture(page, identity, 'source-control', 'unstaged-changes');
    for (const [path, kind] of [
      [file, 'modified'],
      ['added.ontology.yaml', 'added'],
      [removed, 'deleted'],
    ]) {
      await attempt(page, identity, 'source-control', `diff-${kind}`, async () => {
        await page
          .getByRole('region', { name: 'Source Control', exact: true })
          .getByRole('button', { name: new RegExp('^' + path.replaceAll('.', '\\.') + ', ') })
          .click();
      });
    }
    await attempt(page, identity, 'source-control', 'staged-changes', async () => {
      await page.getByRole('region', { name: 'Changes', exact: true }).getByRole('button', { name: 'Stage all', exact: true }).click();
    });
    await attempt(page, identity, 'source-control', 'commit-message-filled', async () => {
      await page.getByLabel('Commit message', { exact: true }).fill('Update customer definition');
    });
    git(directory, ['add', '.']);
    git(directory, ['commit', '-qm', 'Update customer definition']);
    await api.ws.rescan(project.slug);
    await attempt(page, identity, 'source-control', 'new-branch-form', async () => {
      await page.getByRole('button', { name: 'New branch', exact: true }).click();
    });
    await page.keyboard.press('Escape');
    await attempt(page, identity, 'source-control', 'remote-none', async () => {
      await openRemoteDialog(page);
    });
    await page.keyboard.press('Escape');
    git(extra, ['init', '-q', '--bare', '-b', 'main', bare]);
    git(directory, ['remote', 'add', 'origin', bare]);
    git(directory, ['push', '-qu', 'origin', 'main']);
    const other = join(extra, 'other');
    git(extra, ['clone', '-q', bare, other]);
    writeFileSync(join(other, 'remote-note.txt'), 'Remote addition\n');
    git(other, ['add', '.']);
    git(other, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Add remote note']);
    git(other, ['push', '-q']);
    git(directory, ['fetch', '-q']);
    writeFileSync(join(directory, 'local-note.txt'), 'Local addition\n');
    git(directory, ['add', '.']);
    git(directory, ['commit', '-qm', 'Add local note']);
    await api.ws.rescan(project.slug);
    await page.reload();
    await page.waitForTimeout(1000);
    await scm(page);
    await capture(page, identity, 'source-control', 'remote-ahead-behind');
    await attempt(page, identity, 'source-control', 'remote-local', async () => {
      await openRemoteDialog(page);
    });
    await page.keyboard.press('Escape');
    await attempt(page, identity, 'remote-folder', 'refused', async () => {
      await openRemoteDialog(page);
      const dialog = remoteDialog(page);
      await dialog.getByLabel('Folder in repository').fill('/etc');
      await dialog.getByText(/not an absolute path/).waitFor();
    });
    await attempt(page, identity, 'remote-folder', 'preview', async () => {
      const dialog = remoteDialog(page);
      await dialog.getByLabel('Folder in repository').fill('models/commerce');
      await dialog.getByRole('button', { name: 'Save remote', exact: true }).click();
      await dialog.getByRole('list', { name: 'Files that move', exact: true }).waitFor();
    });
    await page.keyboard.press('Escape');
    await draft(page, identity, file, original, directory);
    await page.reload();
    await page.waitForTimeout(800);
    await scm(page);
    git(directory, ['checkout', '-qb', 'capture-conflict']);
    writeFileSync(join(directory, file), original.replace('Customer in the order-to-cash process.', 'Customer on feature branch.'));
    git(directory, ['add', file]);
    git(directory, ['commit', '-qm', 'Feature customer definition']);
    git(directory, ['checkout', '-q', 'main']);
    writeFileSync(join(directory, file), original.replace('Customer in the order-to-cash process.', 'Customer on main branch.'));
    git(directory, ['add', file]);
    git(directory, ['commit', '-qm', 'Main customer definition']);
    git(directory, ['merge', 'capture-conflict'], true);
    await api.ws.rescan(project.slug);
    await page.reload();
    await page.waitForTimeout(1000);
    await scm(page);
    await capture(page, identity, 'source-control', 'merge-conflict');
  } catch (error) {
    failure(identity, 'source-control', 'fixture-stages', error);
  } finally {
    await page.close();
    await api.stop();
    rmSync(extra, { recursive: true, force: true });
  }
}

async function draft(page: Page, identity: CaptureIdentity, file: string, original: string, directory: string) {
  await fileTab(file, 'Source')(page);
  const editor = page.getByRole('textbox', { name: 'Definition source', exact: true });
  await fillEditor(editor, original.replace('Customer in the order-to-cash process.', '"Unclosed customer definition'));
  await page.getByRole('status', { name: 'Save state' }).filter({ hasText: 'Not saved' }).waitFor({ timeout: 6000 });
  await capture(page, identity, 'source-editor', 'invalid-unsaved-warning');
  await attempt(page, identity, 'source-editor', 'validation-details', async () => {
    await page.getByRole('status', { name: 'Save state' }).click();
  });
  await page.keyboard.press('Escape');
  await fillEditor(editor, original);
  await page.waitForTimeout(1500);
  await page.route(
    '**/api/projects/*/files/' + file,
    async route => {
      if (route.request().method() === 'PUT') writeFileSync(join(directory, file), original.replace('Customer in the order-to-cash process.', 'Externally changed customer.'));
      await route.fallback();
    },
    { times: 1 },
  );
  await fillEditor(editor, original.replace('Customer in the order-to-cash process.', 'Unsaved customer edit.'));
  await attempt(page, identity, 'source-editor', 'stale-save-warning', async () => {
    await page.getByRole('dialog', { name: /changed since you opened it/ }).waitFor({ timeout: 6000 });
  });
}

try {
  for (const theme of ['light', 'dark']) {
    for (const [width, height] of authViewports) await captureFixture({ output, mode: 'local', theme, width, height });
  }
} finally {
  await browser.close();
}
