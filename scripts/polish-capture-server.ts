// Captures the tour of screens in server mode, signed in through the mock identity provider, at
// the four supported viewport sizes. Run `bun run build` first. Usage:
//   bun scripts/polish-capture-server.ts <output directory> [user]
// Set SW_THEME=dark to photograph the dark theme; file names then start with server-dark-.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGit } from '../server/projects/git';
import { withCleanup } from './helpers/processes';
import { TEST_USERS } from '../tests/helpers/auth-identities';
import { startMockOidc } from '../tests/helpers/mock-oidc';
import { freeAuthPort, startAuthApi } from './auth-environment';
import { authViewports, signIn, type SignInTarget } from './helpers/sign-in';
import { screenProblems, showScreen } from './helpers/screen-tour';
import { captureScreens } from './helpers/all-tours';

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error('Pass an output directory.');
const dark = process.env.SW_THEME === 'dark';
const prefix = dark ? 'server-dark' : 'server';
const requestedUser = process.argv[3] ?? 'dave';
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
// Access fixtures are deliberately minimal; the visual tour also needs section and edit dialogs.
async function prepareCaptureContract(root: string) {
  const path = join(root, 'projects', 'sales-contracts', 'orders.odcs.yaml');
  const lines = [
    readFileSync(path, 'utf8').trimEnd(),
    '      - name: status',
    '        logicalType: string',
    '        description: Order fulfillment status.',
    'team:',
    '  - username: sales-data',
    '    role: owner',
    '',
  ];
  writeFileSync(path, lines.join('\n'));
  const projectsRoot = join(root, 'projects');
  const git = createGit({ projectsRoot });
  const result = await git.commitPaths(
    join(projectsRoot, 'sales-contracts'),
    ['orders.odcs.yaml'],
    'Prepare visual capture contract',
  );
  if (!result.committed) throw Error(`Capture fixture commit refused: ${result.reason}`);
}

let api: Awaited<ReturnType<typeof startAuthApi>> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

async function stopCapture() {
  try {
    await browser?.close();
  } finally {
    try {
      await api?.stop();
    } finally {
      await mock.stop();
    }
  }
}

await withCleanup(stopCapture, async () => {
  api = await startAuthApi(
    url,
    { ...mock, kind: 'entra' },
    {
      prepare: prepareCaptureContract,
    },
  );
  browser = await chromium.launch({ headless: true });
  const target: SignInTarget = { url, issuer: mock.endpointBase, kind: 'entra' };
  const context = await browser.newContext();
  const loginPage = await context.newPage();
  if (dark) await loginPage.addInitScript(() => localStorage.setItem('workbench.theme', 'dark'));
  await signIn(loginPage, target, user);
  const files = await loginPage
    .locator('.workspace-sidebar button.document span')
    .allTextContents();
  await loginPage.close();
  for (const [width, height] of authViewports) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height });
    await page.goto(url);
    await page.locator('.workspace-sidebar button.document').first().waitFor({ state: 'attached' });
    await page.locator('.tabs').waitFor();
    const screens = captureScreens({
      ontology: files.find(name => name.includes('ontology')) ?? files[0] ?? '',
      contract:
        files.find(name => name === 'orders.odcs.yaml') ??
        files.find(name => name.includes('odcs')) ??
        files[0] ??
        '',
      metricsModel: files.find(name => name.includes('semantic')) ?? files[0] ?? '',
      mapping: files.find(name => name.includes('mapping')) ?? '',
      serverMode: true,
    }).filter(screen => screen.name.includes(process.env.SW_ONLY ?? ''));
    for (const screen of screens) {
      try {
        await showScreen(page, screen);
      } catch (error) {
        console.log('SKIP', screen.name, width, String(error).split('\n')[0]);
        if (user === 'dave') throw error;
        continue;
      }
      await page.screenshot({ path: `${outputDirectory}/${prefix}-${screen.name}-${width}.png` });
      const problems = await screenProblems(page, screen);
      console.log(`MEASURE ${screen.name} ${width} problems=${problems.length}`);
      for (const problem of problems.slice(0, 8)) console.log('   ', problem);
      if (problems.length) throw Error(`Capture geometry failed for ${screen.name}.`);
    }
    await page.close();
  }
});
