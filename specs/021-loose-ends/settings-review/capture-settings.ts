import { chromium, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { capture, attempt, watchCaptureErrors, type CaptureIdentity } from '../../../scripts/ui-review/capture-records';
import { adminArea } from '../../../scripts/helpers/admin-browser';
import { showSidebar } from '../../../scripts/helpers/screen-tour';
import { openSettings } from '../../../scripts/helpers/sidebar-menus';
import { signIn } from '../../../scripts/helpers/sign-in';
import type { IsolatedApi } from '../../../scripts/helpers/isolated-api';
import { startAuthApi } from '../../../scripts/auth-environment';
import { startMockOidc } from '../../../tests/helpers/mock-oidc';
import { TEST_USERS, TEST_TENANT_ID } from '../../../tests/helpers/auth-identities';
import { validateAccessDocument } from '../../../src/server/auth/access-config';
import { captureThemes } from '../../../scripts/ui-review/capture-records';
import { lowContrastProblems, textCollisionProblems } from '../../../scripts/helpers/text-geometry';

const output = 'specs/021-loose-ends/settings-review';
const roundTwo = process.env.CAPTURE_ROUND === '2';
if (captureThemes().length !== 2) throw new Error('Unset SW_THEME to capture both requested themes.');
if (!roundTwo) throw new Error('Set CAPTURE_ROUND=2 to capture only complementary states.');
const originalManifest = readFileSync(`${output}/manifest.md`, 'utf8');
const originalFindings = readFileSync(`${output}/findings.md`, 'utf8');
const command =
  "sw-midgard-run --pull specs/021-loose-ends/settings-review -- bash -c 'mkdir -p $HOME/scratch/sw-settings && export TMPDIR=$HOME/scratch/sw-settings && bun run build && CAPTURE_ROUND=2 bun specs/021-loose-ends/settings-review/capture-settings.ts'";
const rows: string[] = [];
const observations: string[] = [];
const missing: string[] = [];
let imageCount = readdirSync(`${output}/captures`).filter(name => name.includes('-round2-') && name.endsWith('.png')).length;
let currentUser = 'Dave (Admin)';
const longText = 'International semantic governance and analytical interoperability coordination '.repeat(3);

mkdirSync(`${output}/captures`, { recursive: true });

function saveReports() {
  writeFileSync(`${output}/manifest.md`, `${originalManifest.trimEnd()}\n${rows.join('\n')}\n`);
  const report = `\n## Complementary measurements\n\n${observations.join('\n')}\n\n## Complementary omissions\n\n${missing.map(value => `- ${value}`).join('\n')}\n`;
  writeFileSync(`${output}/findings.md`, originalFindings + report);
}

async function safely(name: string, action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    missing.push(`${name}: ${String(error).replaceAll('\n', ' ').slice(0, 550)}`);
    console.log('MISSING', name, String(error).slice(0, 150));
  }
  saveReports();
}

async function measure(page: Page, selector: string, label: string) {
  const text = await page
    .locator(selector)
    .first()
    .evaluate(root => {
      function visibleText(element: HTMLElement) {
        if (element.closest('#credential') || !element.checkVisibility()) return false;
        const box = element.getBoundingClientRect();
        const inViewport = box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
        return inViewport && [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      }
      const clipped: string[] = [];
      const ellipses: string[] = [];
      for (const element of root.querySelectorAll<HTMLElement>('*')) {
        if (!visibleText(element)) continue;
        const label = (element.textContent ?? '').trim().replaceAll(/\s+/g, ' ').slice(0, 90);
        if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) {
          clipped.push(`${label} (${element.scrollWidth}×${element.scrollHeight} > ${element.clientWidth}×${element.clientHeight})`);
        }
        if (/…|\.\.\./.test(label) || (getComputedStyle(element).textOverflow === 'ellipsis' && element.scrollWidth > element.clientWidth)) ellipses.push(label);
      }
      const markers = [...root.querySelectorAll<HTMLElement>('[role=alert],[role=status],.admin-chip,.agent-connections-list li')].filter(element => element.checkVisibility());
      const colourOnly = markers.filter(element => !element.textContent?.trim()).map(element => element.tagName);
      for (const selected of root.querySelectorAll<HTMLElement>('[aria-pressed=true]')) {
        const other = selected.parentElement?.querySelector<HTMLElement>('[aria-pressed=false]');
        if (other && getComputedStyle(selected).fontWeight === getComputedStyle(other).fontWeight && !selected.querySelector('svg')) colourOnly.push(`Pressed state for ${selected.textContent}`);
      }
      return { clipped, ellipses, colourOnly, markers: markers.length };
    });
  const collisions = await textCollisionProblems(page, selector);
  const contrast = await lowContrastProblems(page, selector);
  observations.push(`- ${label}: clipped text: ${text.clipped.join('; ') || 'none found'}. Visible ellipsis: ${text.ellipses.join('; ') || 'none found'}.`);
  observations.push(
    `- ${label}: colour-only status/selection markers: ${text.colourOnly.join('; ') || 'none found'} (${text.markers} visible text status/chip/connection candidates, plus pressed controls).`,
  );
  observations.push(`- ${label}: overlapping text: ${collisions.join('; ') || 'none found'}. Text contrast: ${contrast.join('; ') || 'none found'}.`);
}

async function focusChecks(page: Page, selector: string, label: string) {
  const dialog = page.locator(selector).first();
  const modal = (await dialog.getAttribute('role')) === 'dialog' || (await dialog.evaluate(element => element.tagName === 'DIALOG'));
  const first = dialog.locator('button:enabled,a[href],input:enabled,select:enabled,textarea:enabled').first();
  if (await first.count()) await first.focus();
  const findings: string[] = [];
  const controls = await dialog.locator('button:enabled,a[href],input:enabled,select:enabled,textarea:enabled').count();
  for (let index = 0; index < Math.min(controls + 2, 24); index++) {
    await page.keyboard.press('Tab');
    const result = await page.evaluate(rootSelector => {
      const root = document.querySelector(rootSelector);
      if (!root) return 'Dialog closed on Tab';
      const active = document.activeElement as HTMLElement | null;
      if (!active) return 'No active element';
      if (!root.contains(active)) return `Tab left region for ${active.tagName} ${active.textContent?.trim().slice(0, 50)}`;
      const style = getComputedStyle(active);
      if (style.outlineStyle === 'none' && style.boxShadow === 'none') return `No outline or box-shadow on ${active.tagName} ${active.textContent?.trim().slice(0, 40)}`;
      return '';
    }, selector);
    if (result && (modal || !result.startsWith('Tab left'))) findings.push(result);
    if (result.startsWith('Tab left') || result.startsWith('Dialog closed')) break;
  }
  observations.push(
    `- ${label}: focus indicator${modal ? ' and dialog Tab containment' : ''}: ${findings.join('; ') || 'none found'} (outline/box-shadow heuristic; ${Math.min(controls + 2, 24)} Tab presses maximum).`,
  );
  if (await dialog.count()) {
    await dialog.evaluate(root => {
      root.scrollTop = 0;
    });
  }
}

async function photograph(page: Page, screen: string, state: string, ...[theme, width, selector, part = '']: [string, number, string, string?]) {
  if (imageCount >= 40) {
    missing.push(`${screen}/${state}/${theme}/${width}${part}: omitted at the 40-new-image ceiling.`);
    return;
  }
  const file = `captures/${screen}-${state}${part}-round2-${theme}-${width}.png`;
  if (existsSync(`${output}/${file}`)) return;
  const region = page.locator(selector).first();
  const crop = selector === 'dialog[open]' ? region.locator('.workbench-dialog') : region;
  const box = await crop.boundingBox();
  if (!box) throw new Error(`No crop for ${selector}`);
  const height = page.viewportSize()!.height;
  const clip = { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.min(width, box.x + box.width) - Math.max(0, box.x), height: Math.min(height, box.y + box.height) - Math.max(0, box.y) };
  // The shared recorder requests a full-page companion; it would exceed the image dimensions and budget.
  const bounded = new Proxy(page, {
    get(target, property) {
      if (property === 'screenshot')
        return async (options: { fullPage?: boolean }) => {
          if (options.fullPage) return Buffer.alloc(0);
          return target.screenshot({ path: `${output}/${file}`, clip, animations: 'disabled', mask: [page.locator('#credential')] });
        };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  await page.locator('#credential').evaluateAll(elements => elements.forEach(element => element.setAttribute('aria-hidden', 'true')));
  const identity: CaptureIdentity = { output: process.env.TMPDIR!, mode: 'settings-review', theme, width, height, user: currentUser };
  watchCaptureErrors(page, identity);
  if (state === 'error')
    await attempt(bounded, identity, screen, state + part, async () => {
      await region.waitFor({ state: 'visible' });
    });
  else await capture(bounded, identity, screen, state + part);
  imageCount++;
  console.log('CAPTURED', imageCount, file);
  rows.push(
    `| ${screen} | ${state}${part} | ${theme} | ${width} | [${file}](${file}) | ${currentUser} | ${selector === 'dialog[open]' ? 'dialog[open] .workbench-dialog' : selector}; ${Math.round(clip.width)}×${Math.round(clip.height)} | \`${command}\` |`,
  );
  await measure(page, selector, `${screen}/${state}${part}/${theme}/${width}`);
  await focusChecks(page, selector, `${screen}/${state}${part}/${theme}/${width}`);
  saveReports();
}

async function preparePanel(page: Page, selector: string, theme: string) {
  if (selector === '#settings-panel') {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Person menu', exact: true }).waitFor();
    await showSidebar(page);
    await openSettings(page);
    await page
      .locator('#settings-panel')
      .getByRole('button', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true })
      .click();
  }
}

async function shot(page: Page, screen: string, state: string, ...[theme = 'light', width = 1440, selector = '.admin-content']: [string?, number?, string?]) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await preparePanel(page, selector, theme);
  await page.evaluate(value => {
    localStorage.setItem('workbench.theme', value);
    document.documentElement.setAttribute('data-theme', value);
  }, theme);
  await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
  await page
    .locator('[role=status]')
    .filter({ hasText: 'Reading the state of usage counters' })
    .waitFor({ state: 'hidden', timeout: 10000 })
    .catch(() => {});
  if (state === 'filled' && screen === 'admin-roles') await page.locator('.admin-content table').first().waitFor();
  if (state === 'filled' && screen === 'admin-git-remotes') await page.locator('.admin-content tbody tr').first().waitFor();
  await page.waitForTimeout(250);
  await photograph(page, screen, state, theme, width, selector);
  if (width !== 390 || selector === '#settings-panel' || selector === 'body' || selector === '.admin-page') return;
  const region = page.locator(selector).first();
  const extent = await region.evaluate(element => ({ full: element.scrollHeight, view: element.clientHeight }));
  if (extent.full > extent.view + 1) missing.push(`${screen}/${state}/${theme}/390: lower scroll slices omitted within the image budget (${extent.full}px content, ${extent.view}px visible).`);
}

async function cancel(page: Page) {
  const dialog = page.locator('dialog[open]').last();
  if (await dialog.count()) {
    const button = dialog.getByRole('button', { name: /^(Cancel|Cancel changes|Close)$/ }).last();
    if (await button.count()) await button.click();
    else await page.keyboard.press('Escape');
  }
}

async function agentFlow(page: Page) {
  await page.goto(serverUrl);
  await page.getByRole('button', { name: 'Person menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Agent connections', exact: true }).click();

  await page.getByRole('link', { name: 'Create a setup credential', exact: true }).click();
  for (const scope of ['edit', 'commit', 'remote', 'publish']) {
    const checkbox = page.locator(`input[name=scope][value=${scope}]`);
    if (await checkbox.isEnabled()) await checkbox.uncheck();
  }

  await page.getByRole('button', { name: 'Create setup credential', exact: true }).click();
  await page.locator('#credential').waitFor();
  const credential = (await page.locator('#credential').textContent())!.trim();

  const response = await fetch(serverUrl + '/oauth/token', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'urn:semantic-workbench:grant-type:setup', setup_credential: credential, client_id: program.clientId, resource: serverUrl + '/api/mcp' }),
  });
  if (!response.ok) throw new Error(`Setup exchange status ${response.status}`);
  await page.goto(serverUrl);
}

const program = {
  clientId: 'review-agent',
  name: 'International semantic governance analytical interoperability coordination agent',
  description: 'Review metadata and validate analytical definitions for the finance team.',
  redirectUris: ['http://127.0.0.1:5453/' + 'semantic-governance-callback/'.repeat(15)],
  scopes: ['read', 'validate'],
  setupNote: 'Connect to the workspace with your current roles.',
};

async function prepareFixture(root: string) {
  mkdirSync(`${root}/admin/policies`, { recursive: true });
  writeFileSync(`${root}/admin/programs.json`, JSON.stringify({ formatVersion: 1, programs: [program] }));
  writeFileSync(
    `${root}/admin/policies/review.cedar`,
    '@id("review_read")\n@description("Review access to metadata")\n@enabled("true")\npermit(principal, action == SW::Action::"read", resource) when { false };\n',
  );
  prepareLongText(root);
  for (const area of ['grants', 'projects', 'settings', 'programs']) {
    validateAccessDocument(`${area}File`, JSON.parse(readFileSync(`${root}/admin/${area}.json`, 'utf8')));
  }
  const config = readdirSync(root, { recursive: true }).find(name => typeof name === 'string' && name.endsWith('/.git/config') && !name.startsWith('admin/'));
  if (config)
    appendFileSync(
      `${root}/${config}`,
      '\n[remote "origin"]\n\turl = https://example.invalid/international-semantic-governance/international-semantic-governance/international-semantic-governance/international-semantic-governance/international-semantic-governance/international-semantic-governance/international-semantic-governance/international-semantic-governance/repository.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n',
    );
}

const serverUrl = 'http://127.0.0.1:5450';
const localUrl = 'http://127.0.0.1:5452';
TEST_USERS.bob.name = longText.trim();
TEST_USERS.bob.email = 'international.semantic.governance.reviewer@' + 'analytical-interoperability.'.repeat(5) + 'example.invalid';
const mock = await startMockOidc({ shape: 'entra', layout: 'entra', port: 5451, redirectUris: [serverUrl + '/auth/callback'] });
const server = await startAuthApi(serverUrl, { ...mock, kind: 'entra' }, { prepare: prepareFixture });
const local: Pick<IsolatedApi, 'root' | 'stop'> = await startAuthApi(localUrl, { mode: 'local' });
const browser = await chromium.launch();
const target = { url: serverUrl, issuer: mock.endpointBase, kind: 'entra' as const };
try {
  await runComplementaryCapture();
} finally {
  saveReports();
  await browser.close();
  await server.stop();
  await local.stop();
  await mock.stop();
}

function prepareLongText(root: string) {
  const grantsPath = `${root}/admin/grants.json`;
  const grants = JSON.parse(readFileSync(grantsPath, 'utf8'));
  grants.grants[0].member.displayName = longText;
  grants.grants.find((grant: { id: string }) => grant.id === 'g-bob').member.email = TEST_USERS.bob.email;
  writeFileSync(grantsPath, JSON.stringify(grants));
  const projectsPath = `${root}/admin/projects.json`;
  const projects = JSON.parse(readFileSync(projectsPath, 'utf8'));
  projects.domains[0].name = longText.slice(0, 80);
  projects.projects['sales-contracts'].stewards = [TEST_USERS.bob.email];
  projects.projects['sales-contracts'].restricted[0].pattern = 'finance/' + 'international-semantic-governance/'.repeat(8) + '**';
  writeFileSync(projectsPath, JSON.stringify(projects));
  const settingsPath = `${root}/admin/settings.json`;
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  settings.remote.allowedHosts = [Array(8).fill('international-semantic-governance').join('.') + '.example.invalid'];
  settings.remote.github.host = settings.remote.allowedHosts[0];
  writeFileSync(settingsPath, JSON.stringify(settings));
}

async function workspaceReady(page: Page, destination: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api/projects' && value.ok());
  await page.goto(destination);
  const projects = await (await response).json();
  await page.getByRole('button', { name: 'Person menu', exact: true }).waitFor();
  if (projects.length) await page.getByRole('tree', { name: 'Projects' }).getByRole('treeitem').first().waitFor();
  await page.waitForTimeout(300);
}

async function panelVariants(page: Page, mode: string, state: string, variants: [string, number][]) {
  for (const [theme, width] of variants) {
    await safely(`Settings ${mode}/${state}/${theme}/${width}`, async () => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await showSidebar(page);
      const panel = await openSettings(page);
      const disabled = await panel.getByRole('button', { name: 'Clear workspace', exact: true }).isDisabled();
      observations.push(`- Settings ${mode}/${state}/${theme}/${width}: Clear workspace disabled=${disabled}; text: ${(await panel.innerText()).replaceAll('\n', '; ')}.`);
      await shot(page, `settings-panel-${mode}`, state, theme, width, '#settings-panel');
    });
  }
}

async function clearConfirmation(page: Page, mode: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await showSidebar(page);
  const panel = await openSettings(page);
  await panel.getByRole('button', { name: 'Clear workspace', exact: true }).click();
  await page.locator('dialog[open]').waitFor();
  await shot(page, `clear-workspace-${mode}`, 'confirmation', 'light', 1440, 'dialog[open]');
  await cancel(page);
}

async function panelGaps(page: Page, reader: Page, localPage: Page) {
  currentUser = 'Local operator';
  await workspaceReady(localPage, localUrl);
  await panelVariants(localPage, 'local', 'disabled', [
    ['dark', 1440],
    ['light', 390],
    ['dark', 390],
  ]);
  const loaded = await localPage.request.post(localUrl + '/api/examples/ubl', { headers: { Origin: localUrl, 'X-SW-Request': '1' }, data: {} });
  if (!loaded.ok()) throw new Error(`Local example load returned ${loaded.status()}`);
  await workspaceReady(localPage, localUrl);
  await panelVariants(localPage, 'local', 'enabled', [
    ['light', 1440],
    ['dark', 390],
  ]);
  await safely('Clear local workspace confirmation', () => clearConfirmation(localPage, 'local'));
  currentUser = 'Dave (Admin)';
  await workspaceReady(page, serverUrl);
  await panelVariants(page, 'server', 'enabled', [['dark', 390]]);
  await safely('Clear server workspace confirmation', () => clearConfirmation(page, 'server'));
  currentUser = 'Alice (Editor)';
  await workspaceReady(reader, serverUrl);
  await panelVariants(reader, 'server-non-admin', 'read-only', [
    ['dark', 1440],
    ['light', 390],
    ['dark', 390],
  ]);
  currentUser = 'Dave (Admin)';
}

async function sectionReady(page: Page, label: string, ready: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(serverUrl);
  const area = await adminArea(page, label);
  await area.locator(ready).first().waitFor();
  await page.waitForTimeout(300);
  return area;
}

async function longSections(page: Page, person: Page) {
  const path = 'finance/' + 'international-governance/'.repeat(10) + 'review.yaml';
  const audited = await person.request.get(`${serverUrl}/api/projects/sales-contracts/files/${path}`);
  observations.push(`- Long audit resource request returned HTTP ${audited.status()}; subject is the signed-in long-name fixture identity.`);
  for (const [label, screen, ready] of [
    ['Access grants', 'grants', 'tbody tr'],
    ['Users & groups', 'users', 'tbody tr'],
    ['Projects access', 'projects', 'fieldset'],
    ['Git remotes', 'git-remotes', 'tbody tr'],
    ['Agent programs', 'agent-programs', '.agent-program-fields'],
    ['Agent connections', 'agent-connections', '.agent-connections-list li'],
    ['Audit', 'audit', 'tbody tr'],
    ['Settings', 'settings', '[aria-label="Active sessions"]'],
  ]) {
    await safely(`${label} long text`, async () => {
      const area = await sectionReady(page, label, ready);
      if (screen === 'users') {
        await area.getByLabel('Search people and groups', { exact: true }).fill(TEST_USERS.bob.email);
        await area.getByText(TEST_USERS.bob.name, { exact: true }).first().waitFor();
      }
      if (screen === 'audit') {
        await area.getByLabel('Person', { exact: true }).fill(`${TEST_TENANT_ID}:${TEST_USERS.bob.oid}`);
        await area.getByText(path, { exact: false }).first().waitFor();
      }
      await shot(page, `admin-${screen}`, 'long-text');
      if (screen !== 'settings') await shot(page, `admin-${screen}`, 'long-text', 'light', 390);
    });
  }
  missing.push('Admin Settings/long-text/light/390: omitted to fit 40 new images; desktop captures the same host and session fields.');
  observations.push('- Settings panel long text: not applicable; its labels and reasons are fixed strings, with no project names, e-mail addresses or other fixture text.');
  observations.push('- Agent connections displays program name and origin, but has no redirect-address field; long redirect addresses are present in Agent programs.');
}

async function emptySections(page: Page) {
  await safely('Agent programs empty', async () => {
    const area = await sectionReady(page, 'Agent programs', '.agent-program-fields');
    await area.getByRole('button', { name: `Remove ${program.name}`, exact: true }).click();
    await area.getByText('No agent programs registered.', { exact: true }).waitFor();
    await shot(page, 'admin-agent-programs', 'empty-draft');
    await area.getByRole('button', { name: 'Discard changes', exact: true }).click();
  });
  await safely('Audit empty filter', async () => {
    const area = await sectionReady(page, 'Audit', 'tbody tr');
    await area.getByLabel('Person', { exact: true }).fill('no-matching-review-identity');
    await page.waitForFunction(() => document.querySelectorAll('.admin-content tbody tr').length === 0);
    await shot(page, 'admin-audit', 'empty');
  });
  await safely('Git remotes no remote', async () => {
    const area = await sectionReady(page, 'Git remotes', 'tbody tr');
    await area.getByText('No remote', { exact: true }).first().waitFor();
    await shot(page, 'admin-git-remotes', 'empty-remote');
  });
  await safely('Users empty filter', async () => {
    const area = await sectionReady(page, 'Users & groups', 'tbody tr');
    await area.getByLabel('Search people and groups', { exact: true }).fill('no-matching-review-identity');
    await page.waitForFunction(() => document.querySelectorAll('.admin-content tbody tr').length === 0);
    await shot(page, 'admin-users', 'empty');
  });
}

async function removalReviews(page: Page) {
  for (const [label, action, preview, screen] of [
    ['Agent programs', `Remove ${program.name}`, 'Review change', 'remove-program'],
    ['Projects access', 'Remove domain finance', 'Preview project access', 'remove-domain'],
    ['Projects access', 'Remove restriction', 'Preview project access', 'remove-restriction'],
    ['Git remotes', 'Remove remote', '', 'remove-remote'],
  ]) {
    await safely(screen, async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(serverUrl);
      const area = await adminArea(page, label);
      await area.getByRole('button', { name: action, exact: true }).first().click();
      if (preview) await area.getByRole('button', { name: preview, exact: true }).first().click();
      await page.locator('dialog[open]').waitFor({ timeout: 30000 });
      await shot(page, screen, 'confirmation', 'light', 1440, 'dialog[open]');
      await cancel(page);
    });
  }
}

async function failedLoads(page: Page) {
  await sectionReady(page, 'Access grants', 'tbody tr');
  await server.stop();
  for (const [label, screen] of [
    ['Git remotes', 'git-remotes'],
    ['Audit', 'audit'],
    ['Access check', 'access-check'],
  ]) {
    await safely(`${label} failed load`, async () => {
      await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: label, exact: true }).click();
      await page.locator('.admin-content').getByRole('alert').first().waitFor();
      await shot(page, `admin-${screen}`, 'error');
    });
  }
}

async function runComplementaryCapture() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(10000);
  const reader = await browser.newPage({ deviceScaleFactor: 1 });
  const localPage = await browser.newPage({ deviceScaleFactor: 1 });
  await signIn(reader, target, 'alice');
  await signIn(page, target, 'dave');
  await safely('Settings panel gaps', () => panelGaps(page, reader, localPage));
  for (const [label, screen] of [
    ['Roles', 'roles'],
    ['Git remotes', 'git-remotes'],
  ]) {
    await safely(`${label} filled`, async () => {
      await sectionReady(page, label, label === 'Roles' ? 'table tbody tr' : 'tbody tr');
      await shot(page, `admin-${screen}`, 'filled');
    });
  }
  await safely('Agent connections empty', async () => {
    const area = await sectionReady(page, 'Agent connections', '.agent-connections');
    await area.getByText('No agent connections.', { exact: true }).waitFor();
    await shot(page, 'admin-agent-connections', 'empty');
  });
  await safely('Create fixture connection', () => agentFlow(page));
  const person = await browser.newPage({ deviceScaleFactor: 1 });
  await safely('Long identity sign-in', () => signIn(person, target, 'bob'));
  await longSections(page, person);
  await emptySections(page);
  await removalReviews(page);
  await failedLoads(page);
}
