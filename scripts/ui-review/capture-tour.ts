// Captures missing stock-tour images while retaining failures. Usage: bun scripts/ui-review/capture-tour.ts OUTPUT MODE THEME.
// MODE is local or server; SW_BASE_URL selects the local frontend. Temporary fixtures are removed on exit.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { captureScreens } from '../helpers/all-tours';
import { showScreen, screenProblems } from '../helpers/screen-tour';
import { startIsolatedApi, routeApi } from '../helpers/isolated-api';
import { authViewports, signIn } from '../helpers/sign-in';
import { startMockOidc } from '../../tests/helpers/mock-oidc';
import { freeAuthPort, startAuthApi } from '../auth-environment';
import { withCleanup } from '../helpers/processes';

const [output, mode, theme = 'light'] = process.argv.slice(2);
if (!output || !['local', 'server'].includes(mode)) throw new Error('Expected OUTPUT MODE THEME');
mkdirSync(output, { recursive: true });
const prefix = mode + (theme === 'dark' ? '-dark' : '');
const browser = await chromium.launch();
const local = mode === 'local' ? await startIsolatedApi() : undefined;
const url = local ? (process.env.SW_BASE_URL ?? 'http://127.0.0.1:5190') : `http://127.0.0.1:${freeAuthPort()}`;
const mock = local ? undefined : await startMockOidc({ shape: 'entra', layout: 'entra', port: 0, redirectUris: [url + '/auth/callback'] });
const server = mock ? await startAuthApi(url, { ...mock, kind: 'entra' }) : undefined;
const context = await browser.newContext({ colorScheme: theme === 'dark' ? 'dark' : 'light' });
await context.addInitScript(value => localStorage.setItem('workbench.theme', value), theme);
const files = { ontology: 'ubl.ontology.yaml', contract: 'commerce.odcs.yaml', metricsModel: 'mall.semantic.yaml', mapping: 'commerce.mapping.yaml' };

async function prepare() {
  if (local) {
    for (const example of ['ubl', 'commerce', 'mapped-commerce', 'mall']) await local.ws.loadExample(example);
    return;
  }
  const login = await context.newPage();
  await signIn(login, { url, issuer: mock!.endpointBase, kind: 'entra' }, 'dave');
  const names = await login.locator('.workspace-sidebar button.document span').allTextContents();
  files.ontology = names.find(name => name.includes('ontology')) ?? names[0];
  files.contract = names.find(name => name === 'orders.odcs.yaml') ?? names.find(name => name.includes('odcs')) ?? names[0];
  files.metricsModel = names.find(name => name.includes('semantic')) ?? names[0];
  files.mapping = names.find(name => name.includes('mapping')) ?? '';
  await login.close();
}

async function newPage(width: number, height: number) {
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  await page.setViewportSize({ width, height });
  page.on('pageerror', error => console.log('BROWSER_ERROR', width, error.message));
  page.on('console', message => {
    if (message.type() === 'error') console.log('CONSOLE_ERROR', width, message.text());
  });
  if (local) await routeApi(page, local);
  await page.goto(url);
  await page.waitForTimeout(1500);
  return page;
}

await withCleanup(
  async () => {
    await browser.close();
    await local?.stop();
    await server?.stop();
    await mock?.stop();
  },
  async () => {
    await prepare();
    const screens = captureScreens({ ...files, serverMode: !local });
    console.log(
      'INVENTORY',
      screens.map(screen => screen.name),
    );
    for (const [width, height] of authViewports) {
      let page = await newPage(width, height);
      for (const screen of screens) {
        const path = `${output}/${prefix}-${screen.name}-${width}.png`;
        if (existsSync(path)) continue;
        const problems: string[] = [];
        let failed = false;
        try {
          await showScreen(page, screen);
          problems.push(...(await screenProblems(page, screen)));
        } catch (error) {
          failed = true;
          console.log('FAIL', screen.name, width, String(error));
          problems.push(String(error));
        }
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path });
        console.log('MEASURE', screen.name, width, JSON.stringify(problems));
        appendFileSync(`${output}/events.jsonl`, JSON.stringify({ file: path, screen: screen.name, width, height, problems, failed, captured_at: new Date().toISOString() }) + '\n');
        const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight);
        if (scrolls) await page.screenshot({ path: path.replace('.png', '-full.png'), fullPage: true });
        if (failed || problems.length) {
          await page.close();
          page = await newPage(width, height);
        }
      }
      await page.close();
    }
  },
);
