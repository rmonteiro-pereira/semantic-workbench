/** Source comparisons exercise CodeMirror surfaces that ordinary editor tours do not render. */
import { expect, type Page } from '@playwright/test';
import { fileTab, showSidebar, type Screen } from './screen-tour';
import { editorValue, fillEditor } from './code-editor';

const statusPattern = '**/api/projects/*/git/status';
const diffPattern = '**/api/projects/*/git/diff?*';
const sample = Array.from({ length: 40 }, (_, index) => `# Comparison line ${index}`).join('\n');

/** Checks both solid backgrounds and gradients so transparent gradient layers cannot hide white. */
export async function assertDiffSurfaces(page: Page) {
  if ((await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim())) === '#ffffff') return;
  const colours = await page.locator('.diff-host .cm-gutters, .diff-host .cm-collapsedLines, .diff-host .cm-merge-revert').evaluateAll(elements => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--color-surface-sunken)';
    document.body.append(probe);
    const surface = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return elements.map(element => ({ background: getComputedStyle(element).backgroundColor, image: getComputedStyle(element).backgroundImage, surface }));
  });
  expect(colours.length, 'comparison surfaces are rendered').toBeGreaterThan(0);
  for (const colour of colours) {
    expect(colour.background, 'comparison background follows the sunken surface').toBe(colour.surface);
    expect(colour.image, 'no light gradient overlays the surface').toBe('none');
  }
}

async function showDiff(page: Page, file: string, kind: 'modified' | 'added' | 'deleted') {
  await page.unroute(statusPattern);
  await page.unroute(diffPattern);
  await fileTab(file, 'Overview')(page);
  await page.route(statusPattern, async route => {
    const status = { branch: 'main', upstream: '', ahead: 0, behind: 0, gitAvailable: true, identityConfigured: true, merging: false, hasCommits: true, remotes: {} };
    await route.fulfill({
      json: { ...status, changes: [{ path: file, repoPath: file, project: '', index: kind === 'deleted' ? 'D' : '.', worktree: kind === 'deleted' ? '.' : 'M', untracked: false, conflicted: false }] },
    });
  });
  await page.route(diffPattern, route =>
    route.fulfill({
      json: {
        path: file,
        from: 'HEAD',
        to: kind === 'deleted' ? 'index' : 'worktree',
        before: kind === 'added' ? '' : sample,
        after: kind === 'deleted' ? '' : sample.replace('line 20', 'changed 20'),
        beforeExists: kind !== 'added',
        afterExists: kind !== 'deleted',
        binary: false,
      },
    }),
  );
  await showSidebar(page);
  await page
    .getByRole('button', { name: /^Source control/ })
    .first()
    .click();
  await page.locator('.scm-file').first().click();
  await expect(page.locator('.diff-host .cm-editor').first()).toBeVisible();
  await assertDiffSurfaces(page);
}

async function showStaleSave(page: Page, file: string) {
  await page.unroute(statusPattern);
  await page.unroute(diffPattern);
  await fileTab(file, 'Source')(page);
  const editor = page.getByRole('textbox', { name: 'Definition source', exact: true });
  const original = await editorValue(editor);
  await page.route(
    '**/api/projects/*/files/*',
    async route => {
      if (route.request().method() !== 'PUT') return route.fallback();
      await route.fulfill({ status: 409, json: { currentHash: 'changed', currentSource: original + '\n# Current disk version\n' } });
    },
    { times: 1 },
  );
  await fillEditor(editor, original + '\n# Unsaved comparison\n');
  await expect(page.getByRole('dialog', { name: /changed since you opened it/ })).toBeVisible({ timeout: 10000 });
  await assertDiffSurfaces(page);
}

/** Lists modified, added, staged-deleted and stale-save comparisons for viewport and theme tours. */
export function scmThemeScreens(file: string): Screen[] {
  return [
    ...(['modified', 'added', 'deleted'] as const).map(kind => ({ name: `scm-diff-${kind}`, show: (page: Page) => showDiff(page, file, kind) })),
    { name: 'scm-stale-save', dialog: 'dialog[open]', show: (page: Page) => showStaleSave(page, file) },
  ];
}
