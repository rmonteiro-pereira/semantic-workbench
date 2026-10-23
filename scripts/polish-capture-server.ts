// Captures the tour of screens in server mode, signed in through the mock identity provider, at
// the four supported viewport sizes. Run `bun run build` first. Usage:
//   bun scripts/polish-capture-server.ts <output directory> [user]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { TEST_USERS } from '../tests/helpers/auth-identities';
import { startMockOidc } from '../tests/helpers/mock-oidc';
import { freeAuthPort, startAuthApi } from './auth-environment';
import { authViewports, signIn, type SignInTarget } from './helpers/sign-in';
import { screenProblems, showScreen } from './helpers/screen-tour';
import { tourGroups } from './helpers/all-tours';

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error('Pass an output directory.');
const requestedUser = process.argv[3] ?? 'alice';
if (!(requestedUser in TEST_USERS)) {
  throw new Error(
    `Unknown user ${requestedUser}; use one of ${Object.keys(TEST_USERS).join(', ')}.`,
  );
}
const user = requestedUser as keyof typeof TEST_USERS;
mkdirSync(outputDirectory, { recursive: true });

const url = `http://127.0.0.1:${freeAuthPort()}`;
const mock = await startMockOidc({
  shape: 'entra',
  layout: 'entra',
  port: 0,
  redirectUris: [url + '/auth/callback'],
  postLogoutRedirectUris: [url + '/auth/signed-out'],
  frontChannelLogoutUri: url + '/auth/front-channel-logout',
});
const api = await startAuthApi(url, { ...mock, kind: 'entra' });
const browser = await chromium.launch({ headless: true });
try {
  const target: SignInTarget = { url, issuer: mock.endpointBase, kind: 'entra' };
  const page = await browser.newPage();
  await signIn(page, target, user);
  const files = await page.locator('.sidebar button.document span').allTextContents();
  for (const [width, height] of authViewports) {
    await page.setViewportSize({ width, height });
    const screens = tourGroups({
      ontology: files.find(name => name.includes('ontology')) ?? files[0] ?? '',
      contract: files.find(name => name.includes('odcs')) ?? files[0] ?? '',
      metricsModel: files.find(name => name.includes('semantic')) ?? files[0] ?? '',
    }).flatMap(group => group.screens);
    for (const screen of screens) {
      try {
        await showScreen(page, screen);
      } catch (error) {
        console.log('SKIP', screen.name, width, String(error).split('\n')[0]);
        continue;
      }
      await page.screenshot({ path: `${outputDirectory}/server-${screen.name}-${width}.png` });
      const problems = await screenProblems(page, screen);
      console.log(`MEASURE ${screen.name} ${width} problems=${problems.length}`);
      for (const problem of problems.slice(0, 8)) console.log('   ', problem);
    }
  }
} finally {
  await browser.close();
  await api.stop();
  await mock.stop();
}
