// Checks Git setup from the browser: identity, remote, commit and push, clone, and the credential
// guide. Every remote is a local bare repository or a local test server; no network remote is used.
import { expectDialogGeometry } from './helpers/dialog-geometry';
import { lowContrastProblems, smallTextProblems } from './helpers/text-geometry';
import { openRemoteDialog, remoteButton, remoteDialog, runSyncAction } from './helpers/sync-dialog';
import { appUrl } from './helpers/base-url';
import { chromium, expect, type Locator, type Route } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { sh, ontology } from '../tests/helpers/scm';
import { LOCAL_READER } from '../src/server/projects/reader';

const api = await startIsolatedApi();
const extra = mkdtempSync(join(tmpdir(), 'workbench-git-setup-'));
// Git sees no identity anywhere until the app sets one.
const isolatedGlobal = process.env.GIT_CONFIG_GLOBAL;
const emptyGlobal = join(extra, 'gitconfig');
writeFileSync(emptyGlobal, '[init]\n\tdefaultBranch = main\n');
process.env.GIT_CONFIG_GLOBAL = emptyGlobal;
const created = await api.ws.importBatch(
  {
    name: 'Shop',
    files: [{ path: 'shop.yaml', source: ontology('Buys.') }],
  },
  LOCAL_READER,
);
const repo = join(api.root, 'projects', created.slug);

// A bare repository for push, and a team repository to clone.
const pushTarget = join(extra, 'shop.git');
sh(extra, ['init', '-q', '--bare', '-b', 'main', pushTarget]);
const team = join(extra, 'team-work');
sh(extra, ['init', '-q', '-b', 'main', team]);
writeFileSync(join(team, 'team.yaml'), ontology('Team.'));
writeFileSync(join(team, 'broken.yaml'), 'name: Broken\nontology:\n  - concept: [unclosed\n');
sh(team, ['add', '.']);
sh(team, ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'Team']);
const teamBare = join(extra, 'team.git');
sh(extra, ['clone', '-q', '--bare', team, teamBare]);

// A team repository with several folders, to clone one folder of.
const folderWork = join(extra, 'folder-work');
sh(extra, ['init', '-q', '-b', 'main', folderWork]);
mkdirSync(join(folderWork, 'semantic/ubl'), { recursive: true });
mkdirSync(join(folderWork, 'semantic/crm'), { recursive: true });
writeFileSync(join(folderWork, 'semantic/ubl/shop.yaml'), ontology('Shop.'));
writeFileSync(join(folderWork, 'semantic/crm/crm.yaml'), ontology('Crm.'));
sh(folderWork, ['add', '.']);
sh(folderWork, ['-c', 'user.name=T', '-c', 'user.email=t@e.invalid', 'commit', '-qm', 'Folders']);
const folderBare = join(extra, 'folders.git');
sh(extra, ['clone', '-q', '--bare', folderWork, folderBare]);

// A local HTTP server that refuses every request without credentials, standing for a Git host.
const host = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: () =>
    new Response('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="test"' },
    }),
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
await routeApi(page, api);
let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log('PASS', name);
}
const panel = () => page.getByRole('region', { name: 'Source Control' });

async function expectCloneWaiting(dialog: Locator) {
  const cloneButton = dialog.getByRole('button', { name: 'Clone', exact: true });
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
      .toBe(theme);
    for (const [width, height] of [
      [390, 844],
      [1280, 720],
      [1440, 900],
      [2560, 1440],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(cloneButton).toBeDisabled();
      await expect(dialog).toContainText('Connecting to workspace updates…');
      await expectDialogGeometry(page, `Clone connecting ${theme} at ${width}`);
      expect(await smallTextProblems(page, 'dialog[open]')).toEqual([]);
      expect(await lowContrastProblems(page, 'dialog[open]')).toEqual([]);
      await page.screenshot({ path: `/tmp/workbench-clone-connecting-${theme}-${width}.png` });
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function setRemote(url: string) {
  await openRemoteDialog(page);
  const dialog = remoteDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Remote name')).toHaveValue('origin');
  await dialog.getByLabel('Remote URL').fill(url);
  await dialog.getByRole('button', { name: 'Save remote' }).click();
  await expect(dialog).toHaveCount(0);
}

try {
  await page.goto(appUrl());
  await check(
    'identity: the banner offers Set Git identity; the values go into the repository and count at once',
    async () => {
      const banner = page.getByRole('alert').filter({ hasText: 'no user.name or user.email' });
      await expect(banner).toBeVisible();
      await banner.getByRole('button', { name: 'Set Git identity…' }).click();
      const dialog = page.getByRole('dialog', { name: 'Set Git identity' });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('Name').fill('Ana Lima');
      await dialog.getByLabel('Email').fill('ana@example.org');
      await page.screenshot({ path: '/tmp/workbench-git-identity.png' });
      await dialog.getByRole('button', { name: 'Save identity' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(banner).toHaveCount(0);
      expect(sh(repo, ['config', '--local', 'user.email']).trim()).toBe('ana@example.org');
      expect(readFileSync(emptyGlobal, 'utf8')).toBe('[init]\n\tdefaultBranch = main\n');
    },
  );
  await check('commit: the files saved before the identity existed commit now', async () => {
    await page.getByRole('button', { name: 'Commit…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Commit' });
    await expect(dialog.getByRole('button', { name: 'Commit', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Commit', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(sh(repo, ['log', '-1', '--format=%an']).trim()).toBe('Ana Lima');
  });
  await check(
    'remote: the Remote dialog adds a local bare repository and Push publishes',
    async () => {
      await page.getByRole('button', { name: /^Source control/ }).click();
      await expect(panel()).toBeVisible();
      await expect(panel()).toContainText('No remote yet');
      await expect(remoteButton(page)).toBeVisible();
      await setRemote(pushTarget);
      await runSyncAction(page, 'Push');
      await expect(panel().getByRole('status').filter({ hasText: 'Push finished' })).toBeVisible({
        timeout: 20_000,
      });
      expect(sh(pushTarget, ['log', '-1', '--format=%an']).trim()).toBe('Ana Lima');
    },
  );
  await check(
    'remote: a slow status keeps the Remote fields locked, so typing is never mixed with the prefill',
    async () => {
      const releaseStatus = Promise.withResolvers<void>();
      const holdStatus = async (route: Route) => {
        await releaseStatus.promise;
        await route.fallback();
      };
      await page.route('**/git/status', holdStatus);
      await openRemoteDialog(page);
      const dialog = remoteDialog(page);
      await expect(dialog.getByLabel('Remote URL')).toBeDisabled();
      await expect(dialog.getByLabel('Remote name')).toBeDisabled();
      releaseStatus.resolve();
      await expect(dialog.getByLabel('Remote URL')).toBeEnabled();
      await expect(dialog.getByLabel('Remote URL')).toHaveValue(pushTarget);
      await dialog.getByLabel('Remote URL').fill('/elsewhere.git');
      await expect(dialog.getByLabel('Remote URL')).toHaveValue('/elsewhere.git');
      await page.unroute('**/git/status', holdStatus);
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toHaveCount(0);
    },
  );
  await check(
    'remote: a folder for the project is previewed, confirmed, recorded in a commit and pushed',
    async () => {
      const firstCommit = sh(repo, ['rev-list', '--max-parents=0', 'HEAD']).trim();
      await openRemoteDialog(page);
      const dialog = remoteDialog(page);
      const folder = dialog.getByLabel('Folder in repository');
      await folder.fill('/etc');
      await expect(dialog).toContainText('not an absolute path');
      await expect(dialog.getByRole('button', { name: 'Save remote' })).toBeDisabled();
      await folder.fill('models/shop');
      await dialog.getByRole('button', { name: 'Save remote' }).click();
      const moves = dialog.getByRole('list', { name: 'Files that move' });
      await expect(moves).toContainText('shop.yaml → models/shop/shop.yaml');
      await expect(dialog).toContainText('History is not rewritten');
      await expectDialogGeometry(page, 'remote-folder-preview');
      await dialog.getByRole('button', { name: 'Back' }).click();
      await expect(folder).toHaveValue('models/shop');
      await dialog.getByRole('button', { name: 'Save remote' }).click();
      await dialog.getByRole('button', { name: 'Move files and save' }).click();
      await expect(dialog).toHaveCount(0);
      expect(existsSync(join(repo, 'models/shop/shop.yaml'))).toBe(true);
      expect(existsSync(join(repo, 'shop.yaml'))).toBe(false);
      expect(sh(repo, ['log', '-1', '--format=%s']).trim()).toBe(
        'Move the project into models/shop',
      );
      expect(sh(repo, ['rev-list', '--max-parents=0', 'HEAD']).trim()).toBe(firstCommit);
      await expect(panel().getByLabel('Repository location')).toHaveText(
        'origin · main · models/shop',
      );
      await runSyncAction(page, 'Push');
      await expect(panel().getByRole('status').filter({ hasText: 'Push finished' })).toBeVisible({
        timeout: 20_000,
      });
      expect(sh(pushTarget, ['ls-tree', '-r', '--name-only', 'main']).trim()).toContain(
        'models/shop/shop.yaml',
      );
    },
  );
  await check(
    'credential guide: a push refused for credentials offers the guide; it never asks for them',
    async () => {
      await setRemote(`http://127.0.0.1:${host.port}/shop.git`);
      await runSyncAction(page, 'Push');
      const failure = panel()
        .getByRole('alert')
        .filter({ hasText: /terminal prompts disabled|could not read Username/i });
      await expect(failure).toBeVisible({ timeout: 20_000 });
      await failure.getByRole('button', { name: 'Credential setup guide' }).click();
      const guide = page.getByRole('dialog', { name: 'Credential setup guide' });
      await expect(guide).toContainText('never asks for, stores or sends your credentials');
      await expect(guide.getByRole('status')).toHaveText(
        'No credential helper is set in your Git settings.',
      );
      for (const system of ['Windows', 'macOS', 'Linux']) {
        await guide.getByRole('tab', { name: system }).click();
        await expect(
          guide
            .getByRole('button', { name: /^Copy git config --global credential\.helper/ })
            .first(),
        ).toBeVisible();
      }
      await expect(guide.locator('input[type=password]')).toHaveCount(0);
      await page.screenshot({ path: '/tmp/workbench-git-credentials.png' });
      await guide.getByRole('button', { name: 'Close' }).click();
      await expect(guide).toHaveCount(0);
    },
  );
  await check(
    'clone: Clone repository makes a project; invalid files are listed, not rewritten',
    async () => {
      await page.getByRole('button', { name: 'Import…' }).click();
      await page
        .getByRole('dialog', { name: 'Import' })
        .getByRole('button', { name: 'Clone a Git repository…' })
        .click();
      const dialog = page.getByRole('dialog', { name: 'Clone repository' });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('Repository URL or path').fill(teamBare);
      await dialog.getByRole('button', { name: 'Clone', exact: true }).click();
      await expect(dialog.getByRole('status')).toContainText('Cloned.', { timeout: 20_000 });
      await expect(dialog.getByRole('list', { name: 'Invalid files' })).toHaveText('broken.yaml');
      await page.screenshot({ path: '/tmp/workbench-git-clone.png' });
      await dialog.getByRole('button', { name: 'Open project' }).click();
      await expect(dialog).toHaveCount(0);
      const tree = page.getByRole('tree', { name: 'Projects' });
      await expect(tree.getByRole('treeitem', { name: 'team', exact: true })).toBeVisible();
      const cloned = api.ws.state.registry().projects.find(entry => entry.name === 'team')!;
      expect(cloned.origin).toBe('clone');
      expect(readFileSync(join(api.root, 'projects', cloned.slug, 'broken.yaml'), 'utf8')).toBe(
        'name: Broken\nontology:\n  - concept: [unclosed\n',
      );
    },
  );
  await check(
    'clone: a folder of the repository becomes the project, and a missing folder offers a push',
    async () => {
      let releaseUpdates: () => void = () => {};
      const updatesReady = new Promise<void>(resolve => {
        releaseUpdates = resolve;
      });
      await page.route('**/api/events', async route => {
        await updatesReady;
        await route.continue({ url: api.url + '/api/events' });
      });
      await page.getByRole('button', { name: 'Import…' }).click();
      await page.getByRole('button', { name: 'Clone a Git repository…' }).click();
      const dialog = page.getByRole('dialog', { name: 'Clone repository' });
      await dialog.getByLabel('Repository URL or path').fill(folderBare);
      await dialog.getByLabel('Folder in repository').fill('../outside');
      await expect(dialog).toContainText('may not contain ".."');
      await expect(dialog.getByRole('button', { name: 'Clone', exact: true })).toBeDisabled();
      await dialog.getByLabel('Folder in repository').fill('semantic/none');
      const cloneButton = dialog.getByRole('button', { name: 'Clone', exact: true });
      await expectCloneWaiting(dialog);
      releaseUpdates();
      await expect(cloneButton).toBeEnabled();
      await page.unroute('**/api/events');
      await cloneButton.click();
      await expect(dialog.getByRole('status')).toContainText('The clone failed.', {
        timeout: 20_000,
      });
      await expect(dialog).toContainText('does not exist on the remote branch');
      await dialog
        .getByRole('button', { name: 'Create semantic/none with the first push' })
        .click();
      await expect(dialog.getByRole('status')).toContainText('Cloned.', { timeout: 20_000 });
      await dialog.getByRole('button', { name: 'Close' }).click();
      await page.getByRole('button', { name: 'Import…' }).click();
      await page.getByRole('button', { name: 'Clone a Git repository…' }).click();
      await dialog.getByLabel('Repository URL or path').fill(folderBare);
      await dialog.getByLabel('Folder in repository').fill('semantic/ubl');
      await dialog.getByRole('button', { name: 'Clone', exact: true }).click();
      await expect(dialog.getByRole('status')).toContainText('Cloned.', { timeout: 20_000 });
      await dialog.getByRole('button', { name: 'Open project' }).click();
      const folderProject = api.ws.state
        .registry()
        .projects.find(entry => entry.folder?.endsWith('semantic/ubl'))!;
      const repository = join(api.root, 'projects', folderProject.repo!);
      expect(existsSync(join(repository, 'semantic/ubl/shop.yaml'))).toBe(true);
      expect(existsSync(join(repository, 'semantic/crm'))).toBe(false);
    },
  );
  await check('every remote used is local: a folder or 127.0.0.1', async () => {
    const remotes =
      sh(repo, ['remote', '-v']) +
      sh(
        join(
          api.root,
          'projects',
          api.ws.state.registry().projects.find(entry => entry.name === 'team')!.slug,
        ),
        ['remote', '-v'],
      );
    for (const line of remotes.split('\n').filter(Boolean))
      expect(line).toMatch(/\t(\/|http:\/\/127\.0\.0\.1:)/);
  });
  await check('dialogs fit at 390, 1280, 1440 and 2560 px', async () => {
    for (const [width, height] of [
      [390, 844],
      [1280, 720],
      [1440, 900],
      [2560, 1440],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto(appUrl());
      if (width < 1100)
        await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
      await page.getByRole('button', { name: 'Import…' }).click();
      await page.getByRole('button', { name: 'Clone a Git repository…' }).click();
      const dialog = page.getByRole('dialog', { name: 'Clone repository' });
      await expect(dialog).toBeVisible();
      const box = (await dialog.locator('.workbench-dialog').boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await expectDialogGeometry(page, 'clone-repository');
      await page.screenshot({ path: `/tmp/workbench-git-clone-${width}.png` });
      await dialog.getByRole('button', { name: 'Cancel' }).click();
    }
  });
  await check('browser has no uncaught runtime errors', async () => expect(errors).toEqual([]));
  console.log(`${passed} Git setup checks passed on isolated data root ${api.root}.`);
} finally {
  await browser.close();
  host.stop(true);
  await api.stop();
  process.env.GIT_CONFIG_GLOBAL = isolatedGlobal;
  rmSync(extra, { recursive: true, force: true });
}
