import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startAuthApi } from '../../auth-environment';
import { startMockOidc } from '../../../tests/helpers/mock-oidc';
import { signIn } from '../../helpers/sign-in';
import { adminArea } from '../../helpers/admin-browser';
import { attempt } from '../capture-records';

const output = process.env.JOURNEY_OUTPUT!;
mkdirSync(output, { recursive: true });
const url = 'http://127.0.0.1:5440';
const mock = await startMockOidc({ shape: 'entra', layout: 'entra', port: 5441, redirectUris: [url + '/auth/callback'] });
const api = await startAuthApi(url, { ...mock, kind: 'entra' });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(10000);
  await signIn(page, { url, issuer: mock.endpointBase, kind: 'entra' }, 'dave');
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [390, 1440]) {
      const height = width === 390 ? 844 : 900;
      const identity = { output, mode: 'server', theme, width, height };
      await page.setViewportSize({ width, height });
      await page.evaluate(value => localStorage.setItem('workbench.theme', value), theme);
      await attempt(page, identity, 'policy-editor', 'unsaved-note', async () => {
        await page.goto(url);
        const policies = await adminArea(page, 'Policies');
        await policies.getByRole('button', { name: 'New rule', exact: true }).click();
        const editor = page.getByRole('region', { name: 'Policy editor', exact: true });
        await editor.getByLabel('Description').fill('Journey branch limit');
        await editor.getByLabel('Template', { exact: true }).selectOption('Git action limits');
        await editor.getByLabel('branch', { exact: true }).fill('journey-protected');
        await editor.getByRole('button', { name: 'Use template', exact: true }).click();
      });
    }
  }
} finally {
  await browser.close();
  await api.stop();
  await mock.stop();
}
