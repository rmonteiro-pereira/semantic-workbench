// Checks Git setup from the browser: identity, remote, commit and push, clone, and the credential
// guide. Every remote is a local bare repository or a local test server; no network remote is used.
import { appUrl } from './helpers/base-url';
import { chromium, expect } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { sh, ontology } from '../tests/helpers/scm';

const api = await startIsolatedApi();
const extra = mkdtempSync(join(tmpdir(), 'workbench-git-setup-'));
// Git sees no identity anywhere until the app sets one.
const isolatedGlobal = process.env.GIT_CONFIG_GLOBAL;
const emptyGlobal = join(extra, 'gitconfig');
writeFileSync(emptyGlobal, '[init]\n\tdefaultBranch = main\n');
process.env.GIT_CONFIG_GLOBAL = emptyGlobal;
const created = await api.ws.importBatch({
  name: 'Shop',
  files: [{ path: 'shop.yaml', source: ontology('Buys.') }],
});
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

async function setRemote(url: string) {
  await panel().getByRole('button', { name: 'Remote…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Remote' });
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
      await setRemote(pushTarget);
      await panel()
        .getByRole('group', { name: 'Remote' })
        .getByRole('button', { name: 'Push' })
        .click();
      await expect(panel().getByRole('status').filter({ hasText: 'Push finished' })).toBeVisible({
        timeout: 20_000,
      });
      expect(sh(pushTarget, ['log', '-1', '--format=%an']).trim()).toBe('Ana Lima');
    },
  );
  await check(
    'credential guide: a push refused for credentials offers the guide; it never asks for them',
    async () => {
      await setRemote(`http://127.0.0.1:${host.port}/shop.git`);
      await panel()
        .getByRole('group', { name: 'Remote' })
        .getByRole('button', { name: 'Push' })
        .click();
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
      await page.screenshot({ path: `/tmp/workbench-git-clone-${width}.png` });
      await dialog.getByRole('button', { name: 'Close' }).click();
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
