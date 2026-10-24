// Captures every main screen and dialog at the four supported viewport sizes in local mode and
// prints the measured problems of each. Usage:
//   SW_BASE_URL=http://127.0.0.1:5175 bun scripts/polish-capture.ts <output directory>
// Set SW_THEME=dark to photograph the dark theme; file names then start with local-dark-.
// Set SW_ONLY to a text such as odcs- to photograph only the screens whose name contains it.
import { appUrl } from './helpers/base-url';
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { authViewports } from './helpers/sign-in';
import { screenProblems, showScreen } from './helpers/screen-tour';
import { captureScreens } from './helpers/all-tours';
import { withCleanup } from './helpers/processes';

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error('Pass an output directory.');
mkdirSync(outputDirectory, { recursive: true });

const dark = process.env.SW_THEME === 'dark';
const prefix = dark ? 'local-dark' : 'local';
const api = await startIsolatedApi();
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
await withCleanup(
  async () => {
    try {
      await browser?.close();
    } finally {
      await api.stop();
    }
  },
  async () => {
    await api.ws.loadExample('ubl');
    await api.ws.loadExample('commerce');
    await api.ws.loadExample('mapped-commerce');
    await api.ws.loadExample('mall');
    browser = await chromium.launch();
    const screens = captureScreens({
      ontology: 'ubl.ontology.yaml',
      contract: 'commerce.odcs.yaml',
      metricsModel: 'mall.semantic.yaml',
      mapping: 'commerce.mapping.yaml',
    }).filter(screen => screen.name.includes(process.env.SW_ONLY ?? ''));

    for (const [width, height] of authViewports) {
      const page = await browser.newPage({ viewport: { width, height } });
      if (dark) await page.addInitScript(() => localStorage.setItem('workbench.theme', 'dark'));
      await routeApi(page, api);
      await page.goto(appUrl());
      await page.waitForTimeout(1500);
      for (const screen of screens) {
        try {
          await showScreen(page, screen);
        } catch (error) {
          console.log('SKIP', screen.name, width, String(error).split('\n')[0]);
          throw error;
        }
        const problems = await screenProblems(page, screen);
        await page.screenshot({ path: `${outputDirectory}/${prefix}-${screen.name}-${width}.png` });
        console.log(`MEASURE ${screen.name} ${width} problems=${problems.length}`);
        for (const problem of problems.slice(0, 8)) console.log('   ', problem);
        if (problems.length) throw Error(`Capture geometry failed for ${screen.name}.`);
      }
      await page.close();
    }
  },
);
