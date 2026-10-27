// Checks browser Source Control actions using isolated workspaces and local Git remotes.
import { smallTextProblems, textCollisionProblems } from './helpers/text-geometry';
import {
  openRemoteDialog,
  remoteActions,
  remoteDialog,
  runSyncAction,
} from './helpers/sync-dialog';
import { appUrl } from './helpers/base-url';
import { chromium, expect, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startIsolatedApi, routeApi, type IsolatedApi } from './helpers/isolated-api';
import { projectDir, projectFile } from '../src/server/projects/paths';
import { editorValue, fillEditor } from './helpers/code-editor';
import { example } from './helpers/examples';
import { adminArea, leaveAdmin } from './helpers/admin-browser';
// Local remotes and a second clone exercise conflicts and credential cancellation without network
// access. Screenshots use /tmp/workbench-scm-*.png.
const api = await startIsolatedApi();
const commerce = await api.ws.loadExample('commerce');
const dir = projectDir(api.ws.layout, commerce.slug);
const file = 'commerce-business.ossie.yaml';
const extra = mkdtempSync(join(tmpdir(), 'workbench-remote-'));
const bare = join(extra, 'remote.git');
const other = join(extra, 'other');
const sh = (cwd: string, args: string[]) => {
  const r = Bun.spawnSync(['git', ...args], {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (r.exitCode !== 0) throw Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.toString();
};
sh(extra, ['init', '-q', '--bare', '-b', 'main', bare]);
const read = (path: string) =>
  readFileSync(projectFile(api.ws.layout, commerce.slug, path), 'utf8');
const browser = await chromium.launch();
const errors: string[] = [];
async function newPage(target: IsolatedApi) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await routeApi(page, target);
  await page.goto(appUrl());
  return page;
}
const page = await newPage(api);
let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  const t = Date.now();
  await run();
  passed++;
  console.log('PASS', name, `(${((Date.now() - t) / 1000).toFixed(1)} s)`);
}
const tree = (p: Page = page) => p.getByRole('tree', { name: 'Projects' });
async function openFile(path: string, p: Page = page) {
  await tree(p).getByRole('button', { name: path, exact: true }).first().click();
}
// The sidebar button opens the Source editor without going through the model tabs.
async function showSourceEditor(p: Page) {
  await p.getByRole('button', { name: /^Source editor/ }).click();
}
const panel = () => page.getByRole('region', { name: 'Source Control' });
async function openScm() {
  await page.getByRole('button', { name: /^Source control/ }).click();
  await expect(panel()).toBeVisible();
}
const group = (name: string) => panel().getByRole('region', { name });
// The remote is edited in the Remote dialog opened from the panel.
async function setRemote(url: string) {
  await openRemoteDialog(page);
  const dialog = remoteDialog(page);
  await dialog.getByLabel('Remote URL').fill(url);
  await dialog.getByRole('button', { name: 'Save remote' }).click();
  await expect(dialog).toHaveCount(0);
}
const rowButton = (path: string) =>
  panel().getByRole('button', {
    name: new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, `),
  });
async function commitAll(message: string) {
  await group('Changes').getByRole('button', { name: 'Stage all' }).click();
  await expect(group('Staged changes')).toBeVisible();
  await panel().getByLabel('Commit message').fill(message);
  await panel().getByRole('button', { name: 'Commit' }).click();
  await expect(
    panel()
      .getByRole('status')
      .filter({ hasText: /^Committed/ }),
  ).toBeVisible();
}
async function editInSource(path: string, change: (text: string) => string) {
  await openFile(path);
  await showSourceEditor(page);
  const editor = page.getByRole('textbox', { name: 'Definition source' });
  await fillEditor(editor, change(await editorValue(editor)));
  return editor;
}
// Valid edits are saved automatically after a 1 s pause.
async function saveSource() {
  await page.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes('/files/'), {
    timeout: 5000,
  });
  await expect(page.getByRole('status', { name: 'Save state' })).toHaveText(/^Saved to file/, {
    timeout: 5000,
  });
}
try {
  await check(
    'commit from the panel: the diff shows exactly the changed line; staged, committed with a message',
    async () => {
      await editInSource(file, t =>
        t.replace(
          'description: Customer in the order-to-cash process.',
          'description: Person or company that buys from us.',
        ),
      );
      await saveSource();
      await openScm();
      await expect(
        page.getByRole('button', { name: /^Source control/ }).locator('.nav-count'),
      ).toHaveText('1');
      await rowButton(file).click();
      const diff = panel().getByRole('group', { name: `Changes in ${file}` });
      await expect(diff).toBeVisible();
      const sides = diff.locator('.cm-mergeView .cm-editor');
      await expect(sides).toHaveCount(2);
      await expect(sides.nth(0).locator('.cm-changedLine')).toHaveCount(1);
      await expect(sides.nth(1).locator('.cm-changedLine')).toHaveCount(1);
      await expect(sides.nth(0).locator('.cm-changedLine')).toContainText(
        'Customer in the order-to-cash process.',
      );
      await expect(sides.nth(1).locator('.cm-changedLine')).toContainText(
        'Person or company that buys from us.',
      );
      await page.screenshot({ path: '/tmp/workbench-scm-diff.png' });
      await expect(panel().getByRole('button', { name: 'Commit' })).toBeDisabled();
      await commitAll('Describe customers');
      await expect(
        panel().getByText('No changes. The working tree matches the last commit.'),
      ).toBeVisible();
      expect(sh(dir, ['log', '-1', '--format=%s']).trim()).toBe('Describe customers');
      expect(sh(dir, ['status', '--porcelain'])).toBe('');
    },
  );
  await check(
    'Source control keeps the model tabs and Find an entity, and a tab leaves the panel',
    async () => {
      await openScm();
      const tabs = page.locator('.tabs');
      for (const name of ['Overview', 'Graph', 'Source', 'Metrics']) {
        await expect(tabs.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
      }
      await expect(page.getByPlaceholder('Find an entity…')).toBeVisible();
      await tabs.getByRole('button', { name: /^Graph/ }).click();
      await expect(panel()).toHaveCount(0);
      await openScm();
    },
  );
  await check(
    'a hidden-type file is listed read-only and labelled; Add to .gitignore hides another one and .gitignore is editable',
    async () => {
      writeFileSync(join(dir, 'notes.csv'), 'a,b\n');
      writeFileSync(join(dir, 'debug.log'), 'noise\n');
      const notes = rowButton('notes.csv');
      await expect(notes).toBeVisible({ timeout: 5000 });
      await expect(notes).toContainText('not shown in workspace');
      await expect(panel().getByRole('button', { name: 'Open notes.csv' })).toHaveCount(0);
      await notes.click();
      await expect(panel().getByRole('group', { name: 'Changes in notes.csv' })).toContainText(
        'a,b',
      );
      await panel().getByRole('button', { name: 'Add debug.log to .gitignore' }).click();
      const chooser = panel().getByRole('group', { name: 'Add debug.log to .gitignore' });
      await chooser.getByLabel('All .log files').check();
      await page.screenshot({ path: '/tmp/workbench-scm-ignore.png' });
      await chooser.getByRole('button', { name: 'Add to .gitignore' }).click();
      await expect(rowButton('debug.log')).toHaveCount(0);
      await expect(rowButton('.gitignore')).toBeVisible();
      expect(read('.gitignore')).toBe('*.log\n');
      await expect(tree().getByRole('button', { name: '.gitignore', exact: true })).toBeVisible();
      await commitAll('Notes and ignore rules');
      // Edit .gitignore from the project menu: plain text in Source, saved with the base hash.
      await tree()
        .getByRole('button', { name: `Actions for ${commerce.name}` })
        .click();
      await page.getByRole('menuitem', { name: 'Edit .gitignore' }).click();
      const editor = page.getByRole('textbox', { name: 'Definition source' });
      await expect.poll(() => editorValue(editor)).toBe('*.log\n');
      await fillEditor(editor, '*.log\n*.tmp\n');
      await saveSource();
      expect(read('.gitignore')).toBe('*.log\n*.tmp\n');
      await openScm();
      await commitAll('Ignore temporary files');
    },
  );
  await check(
    'branch: create, commit on it, switch back; every view shows the branch content',
    async () => {
      await panel().getByRole('button', { name: 'New branch' }).click();
      await panel().getByLabel('New branch name').fill('feature/notes');
      await panel().getByRole('button', { name: 'Create' }).click();
      await expect(panel().getByLabel('Branch')).toHaveValue('feature/notes');
      await editInSource(file, t =>
        t.replace(
          'description: Person or company that buys from us.',
          'description: On the feature branch.',
        ),
      );
      await saveSource();
      await openScm();
      await commitAll('Feature wording');
      await panel().getByLabel('Branch').selectOption('main');
      await expect(
        panel().getByRole('status').filter({ hasText: 'Switched to main' }),
      ).toBeVisible();
      await expect.poll(() => read(file)).toContain('Person or company that buys from us.');
      await openFile(file);
      await showSourceEditor(page);
      await expect
        .poll(() => editorValue(page.getByRole('textbox', { name: 'Definition source' })))
        .toContain('Person or company that buys from us.');
      await openScm();
      await page.screenshot({ path: '/tmp/workbench-scm-branch.png' });
    },
  );
  await check(
    'remote: save a local bare remote and push; pull a commit made elsewhere',
    async () => {
      await setRemote(bare);
      await runSyncAction(page, 'Push');
      await expect(panel().getByRole('status').filter({ hasText: 'Push finished' })).toBeVisible({
        timeout: 20000,
      });
      expect(sh(bare, ['log', '-1', '--format=%s', 'main']).trim()).toBe('Ignore temporary files');
      sh(extra, ['clone', '-q', bare, other]);
      writeFileSync(
        join(other, file),
        readFileSync(join(other, file), 'utf8').replace(
          'Order in the order-to-cash process.',
          'Order placed elsewhere.',
        ),
      );
      sh(other, ['commit', '-qam', 'Elsewhere']);
      sh(other, ['push', '-q']);
      await runSyncAction(page, 'Fetch');
      await expect(panel().getByLabel('0 commits to push, 1 to pull')).toBeVisible({
        timeout: 20000,
      });
      await runSyncAction(page, 'Pull');
      await expect(panel().getByRole('status').filter({ hasText: 'Pull finished' })).toBeVisible({
        timeout: 20000,
      });
      expect(read(file)).toContain('Order placed elsewhere.');
      await page.screenshot({ path: '/tmp/workbench-scm-pulled.png' });
    },
  );
  // Valid edits are saved automatically, so the edit that stays unsaved is an invalid one (a
  // server draft); the refusal lists it and offers Commit….
  await check(
    'pull is refused while the open file has edits not saved to file; nothing is stashed; Commit… is offered',
    async () => {
      let original = '';
      await editInSource(file, t => {
        original = t;
        return t.replace('Order placed elsewhere.', '"Unsaved wording.');
      });
      await expect(page.getByRole('status', { name: 'Save state' })).toHaveText(
        /^Not saved: \d+ errors?$/,
        { timeout: 5000 },
      );
      await openScm();
      await runSyncAction(page, 'Pull');
      const refusal = panel().getByRole('alert').filter({ hasText: 'not saved to file yet' });
      await expect(refusal).toContainText(file);
      await expect(refusal.getByRole('button', { name: 'Commit…' })).toBeVisible();
      // The server refuses too, from the stored draft.
      await expect.poll(() => api.ws.state.drafts().map(d => d.path)).toEqual([file]);
      const r = await api.handler(
        new Request(`http://127.0.0.1/api/projects/${commerce.slug}/git/pull`, { method: 'POST' }),
      );
      expect(r.status).toBe(409);
      expect((await r.json()).error).toBe('drafts');
      expect(sh(dir, ['stash', 'list'])).toBe('');
      await refusal.getByRole('button', { name: 'Commit…' }).click();
      await expect(page.getByRole('dialog', { name: 'Commit' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Commit' })).toHaveCount(0);
      await editInSource(file, () => original);
      await expect.poll(() => api.ws.state.drafts().length, { timeout: 5000 }).toBe(0);
    },
  );
  await check(
    'conflict: the pull stops, the file is listed and repaired in Source, staged and committed',
    async () => {
      writeFileSync(
        join(other, file),
        readFileSync(join(other, file), 'utf8').replace(
          'Order placed elsewhere.',
          'Their wording.',
        ),
      );
      sh(other, ['commit', '-qam', 'Theirs']);
      sh(other, ['push', '-q']);
      await editInSource(file, t => t.replace('Order placed elsewhere.', 'Our wording.'));
      await saveSource();
      await openScm();
      await commitAll('Ours');
      await runSyncAction(page, 'Pull');
      await expect(
        panel().getByRole('alert').filter({ hasText: 'stopped on conflicts' }),
      ).toContainText(file, { timeout: 20000 });
      const conflicts = group('Merge conflicts');
      await expect(conflicts).toBeVisible();
      await expect(panel().getByRole('button', { name: 'Commit' })).toBeDisabled();
      await page.screenshot({ path: '/tmp/workbench-scm-conflict.png' });
      await conflicts.getByRole('button', { name: `Open ${file}` }).click();
      const editor = page.getByRole('textbox', { name: 'Definition source' });
      await expect.poll(() => editorValue(editor)).toContain('<<<<<<<');
      const text = await editorValue(editor);
      await fillEditor(
        editor,
        text
          .replace(/<<<<<<< [^\n]*\n([\s\S]*?)=======\n[\s\S]*?>>>>>>> [^\n]*\n/, '$1')
          .replace('Our wording.', 'Our and their wording.'),
      );
      await saveSource();
      await openScm();
      await group('Merge conflicts')
        .getByRole('button', { name: `Stage ${file}` })
        .click();
      await expect(group('Merge conflicts')).toHaveCount(0);
      await panel().getByLabel('Commit message').fill('Merge their wording');
      await panel().getByRole('button', { name: 'Commit' }).click();
      await expect(
        panel()
          .getByRole('status')
          .filter({ hasText: /^Committed/ }),
      ).toBeVisible();
      expect(sh(dir, ['log', '-1', '--format=%P']).trim().split(' ')).toHaveLength(2);
      expect(read(file)).toContain('Our and their wording.');
      await runSyncAction(page, 'Sync');
      await expect(panel().getByRole('status').filter({ hasText: 'Sync finished' })).toBeVisible({
        timeout: 20000,
      });
      expect(sh(bare, ['log', '-1', '--format=%s', 'main']).trim()).toBe('Merge their wording');
    },
  );
  await check('file history: compare two versions of a file', async () => {
    await tree()
      .getByRole('button', { name: `Actions for ${file} in ${commerce.name}` })
      .click();
    await page.getByRole('menuitem', { name: 'History' }).click();
    const history = group('History');
    await expect(history).toContainText(`History of ${file}`);
    await expect(history).toContainText('Describe customers');
    const versions = panel().getByRole('group', { name: `Versions of ${file}` });
    await expect(versions).toBeVisible();
    const log = sh(dir, ['log', '--format=%H %s', '--', file])
      .trim()
      .split('\n')
      .map(l => ({ commit: l.slice(0, 40), message: l.slice(41) }));
    await panel()
      .getByLabel('From version')
      .selectOption(log.find(l => l.message === 'Describe customers')!.commit);
    await panel()
      .getByLabel('To version')
      .selectOption(log.find(l => l.message === 'Elsewhere')!.commit);
    await expect(
      versions.locator('.cm-mergeView .cm-editor').nth(1).locator('.cm-changedLine'),
    ).toContainText(['Order placed elsewhere.']);
    await page.screenshot({ path: '/tmp/workbench-scm-history.png' });
  });
  await check(
    'waiting for credentials: the panel says so and Cancel stops the operation',
    async () => {
      await setRemote('ssh://example.invalid/repo.git');
      process.env.GIT_SSH_COMMAND = 'sleep 30 #';
      try {
        await runSyncAction(page, 'Fetch');
        const waiting = panel().getByRole('status').filter({
          hasText: 'Waiting for Git (credentials may be requested in a separate window)',
        });
        await expect(waiting).toBeVisible();
        await page.screenshot({ path: '/tmp/workbench-scm-waiting.png' });
        await waiting.getByRole('button', { name: 'Cancel' }).click();
        await expect(
          panel().getByRole('status').filter({ hasText: 'Fetch cancelled.' }),
        ).toBeVisible({ timeout: 5000 });
        await expect(waiting).toHaveCount(0);
      } finally {
        delete process.env.GIT_SSH_COMMAND;
      }
    },
  );
  await check('Admin → Git remotes sets and removes a local bare remote', async () => {
    const adminBare = join(extra, 'admin-remote.git');
    sh(extra, ['init', '-q', '--bare', '-b', 'main', adminBare]);
    const remotes = await adminArea(page, 'Git remotes');
    const projectRow = remotes.getByRole('row').filter({ hasText: commerce.name });
    await projectRow.getByRole('button', { name: 'Set remote…', exact: true }).click();
    const dialog = remoteDialog(page);
    await dialog.getByLabel('Remote URL').fill(adminBare);
    await dialog.getByRole('button', { name: 'Save remote' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(projectRow).toContainText(adminBare);
    expect(sh(dir, ['remote', 'get-url', 'origin']).trim()).toBe(adminBare);
    await projectRow.getByRole('button', { name: 'Remove remote', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: /^Remove the remote of/ });
    await confirmation.getByRole('button', { name: 'Remove remote', exact: true }).click();
    await expect(projectRow).toContainText('No remote');
    expect(sh(dir, ['remote']).trim()).toBe('');
    // The later checks need a remote, so it is set again from the same section.
    await projectRow.getByRole('button', { name: 'Set remote…', exact: true }).click();
    await dialog.getByLabel('Remote URL').fill(bare);
    await dialog.getByRole('button', { name: 'Save remote' }).click();
    await expect(projectRow).toContainText(bare);
    await leaveAdmin(page);
  });
  await check(
    'missing Git: the banner explains it, the panel says so, editing and saving still work',
    async () => {
      const noGit = await startIsolatedApi({ gitBinary: join(extra, 'no-such-git') });
      try {
        const p = await newPage(noGit);
        await (await example(p, /Load commerce workspace/)).click();
        await expect(tree(p).getByRole('button', { name: file, exact: true })).toBeVisible({
          timeout: 10000,
        });
        await expect(
          p.getByRole('alert').filter({ hasText: 'Git 2.40 or newer was not found' }),
        ).toBeVisible();
        await p.getByRole('button', { name: /^Source control/ }).click();
        await expect(p.getByRole('region', { name: 'Source Control' })).toContainText(
          'Git was not found on this machine',
        );
        await p.screenshot({ path: '/tmp/workbench-scm-no-git.png' });
        await openFile(file, p);
        await showSourceEditor(p);
        const editor = p.getByRole('textbox', { name: 'Definition source' });
        await fillEditor(
          editor,
          (await editorValue(editor)).replace(
            'Customer in the order-to-cash process.',
            'Saved without Git.',
          ),
        );
        await expect
          .poll(() => readFileSync(projectFile(noGit.ws.layout, 'commerce', file), 'utf8'))
          .toContain('Saved without Git.');
        await p.close();
      } finally {
        await noGit.stop();
      }
    },
  );
  await check('the panel and its remote actions fit at 390, 1280, 1440 and 2560 px', async () => {
    await openScm();
    for (const [width, height] of [
      [390, 844],
      [1280, 720],
      [1440, 900],
      [2560, 1440],
    ] as const) {
      await page.setViewportSize({ width, height });
      // Shrinking the window leaves the sidebar open as a drawer over the panel.
      await page.waitForTimeout(300);
      if (await page.locator('#workspace-sidebar[role=dialog]').count()) {
        await page.keyboard.press('Escape');
      }
      const column = (await panel().locator('.scm-side').boundingBox())!;
      // The project picker exists only when the workspace holds several projects.
      const picker = panel().getByRole('combobox', { name: 'Project' });
      if ((await picker.count()) > 0) {
        const select = (await picker.boundingBox())!;
        expect(select.x + select.width).toBeLessThanOrEqual(column.x + column.width);
      }
      expect(await smallTextProblems(page, '.scm')).toEqual([]);
      expect(await textCollisionProblems(page, '.scm')).toEqual([]);
      // Fetch, Pull, Push and Sync sit on the panel as one row, each inside the column and whole.
      const buttons = remoteActions(page).getByRole('button');
      await expect(buttons).toHaveText(['Fetch', 'Pull', 'Push', 'Sync']);
      await expect(panel().getByRole('button', { name: 'Sync…', exact: true })).toHaveCount(0);
      for (const box of await buttons.evaluateAll(items =>
        items.map(item => ({
          right: item.getBoundingClientRect().right,
          cut: item.scrollWidth > item.clientWidth,
        })),
      )) {
        expect(box.right).toBeLessThanOrEqual(column.x + column.width);
        expect(box.cut).toBe(false);
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await check('no browser errors', async () => {
    expect(errors).toEqual([]);
  });
  console.log(`${passed} source-control checks passed on isolated data root ${api.root}.`);
} finally {
  await browser.close();
  await api.stop();
  rmSync(extra, { recursive: true, force: true });
}
