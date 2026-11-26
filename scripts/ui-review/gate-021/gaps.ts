import { chromium, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startAuthApi } from '../../auth-environment';
import { startMockOidc } from '../../../tests/helpers/mock-oidc';
import { signIn } from '../../helpers/sign-in';
import { adminArea } from '../../helpers/admin-browser';
import { TEST_TENANT_ID, TEST_USERS } from '../../../tests/helpers/auth-identities';
import { capture, attempt, failure } from '../capture-records';

const output = process.env.JOURNEY_OUTPUT!;
mkdirSync(output, { recursive: true });
const url = 'http://127.0.0.1:5440';
const program = {
  clientId: 'journey-agent',
  name: 'Journey agent',
  description: 'Review project definitions.',
  redirectUris: ['http://127.0.0.1:5442/callback'],
  scopes: ['read', 'validate'],
  setupNote: '',
};
const mock = await startMockOidc({ shape: 'entra', layout: 'entra', port: 5441, redirectUris: [url + '/auth/callback'] });
const api = await startAuthApi(
  url,
  { ...mock, kind: 'entra' },
  {
    prepare(root) {
      mkdirSync(`${root}/admin`, { recursive: true });
      writeFileSync(`${root}/admin/programs.json`, JSON.stringify({ formatVersion: 1, programs: [program] }));
    },
  },
);
const browser = await chromium.launch();
const target = { url, issuer: mock.endpointBase, kind: 'entra' as const };

async function connect(page: Page) {
  await page.goto(url);
  await page.getByRole('button', { name: 'Person menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Agent connections', exact: true }).click();
  await page.getByRole('link', { name: 'Create a setup credential', exact: true }).click();
  for (const scope of ['edit', 'commit', 'remote', 'publish']) {
    const checkbox = page.locator(`input[name=scope][value=${scope}]`);
    if (await checkbox.isEnabled()) await checkbox.uncheck();
  }
  await page.getByRole('button', { name: 'Create setup credential', exact: true }).click();
  const credential = (await page.locator('#credential').textContent())!.trim();
  const response = await page.request.post(url + '/oauth/token', {
    form: { grant_type: 'urn:semantic-workbench:grant-type:setup', setup_credential: credential, client_id: program.clientId, resource: url + '/api/mcp' },
  });
  if (!response.ok()) throw new Error(`Setup exchange returned ${response.status()}`);
}

async function connections(page: Page, identity: Parameters<typeof capture>[1]) {
  await page.goto(url);
  const area = await adminArea(page, 'Agent connections');
  await area.getByText(program.name, { exact: true }).first().waitFor();
  await capture(page, identity, 'agent-connections', 'filled');
  await attempt(page, identity, 'agent-connections', 'revoke', async () => {
    await area
      .getByRole('button', { name: `Revoke ${program.name}`, exact: true })
      .first()
      .click();
    await page.waitForTimeout(300);
  });
  const confirmation = page.locator('dialog[open]');
  if (await confirmation.count()) await confirmation.getByRole('button', { name: /^Revoke/ }).click();
  const inlineConfirmation = page.getByRole('button', { name: 'Confirm revocation', exact: true });
  if (await inlineConfirmation.count()) await inlineConfirmation.click();
  await area.getByRole('button', { name: `Revoke ${program.name}`, exact: true }).waitFor({ state: 'hidden' });
}

async function access(page: Page, identity: Parameters<typeof capture>[1]) {
  for (const [project, state] of [
    ['sales-contracts', 'allowed'],
    ['hr-people', 'denied'],
  ]) {
    await attempt(page, identity, 'access-check', state, async () => {
      await page.goto(url);
      const area = await adminArea(page, 'Access check');
      await area.getByLabel('Person ID', { exact: true }).fill(`${TEST_TENANT_ID}:${TEST_USERS.alice.oid}`);
      await area.getByLabel('Project', { exact: true }).fill(project);
      await area.getByRole('button', { name: 'Check access', exact: true }).click();
      await area.getByRole('region', { name: 'Access result', exact: true }).waitFor();
    });
  }
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(10000);
  const editor = await browser.newPage();
  await signIn(editor, target, 'alice');
  await editor.close();
  await signIn(page, target, 'dave');
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      const identity = { output, mode: 'server', theme, width, height: width === 390 ? 844 : 900 };
      try {
        await connect(page);
      } catch (error) {
        failure(identity, 'connection-setup', 'create', error);
        continue;
      }
      await page.setViewportSize({ width, height: identity.height });
      await page.evaluate(value => localStorage.setItem('workbench.theme', value), theme);
      await connections(page, identity);
      await access(page, identity);
    }
  }
} finally {
  await browser.close();
  await api.stop();
  await mock.stop();
}
