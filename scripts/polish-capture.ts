// Captures every main screen and dialog at the four supported viewport sizes in local mode and
// prints the measured problems of each. Usage:
//   SW_BASE_URL=http://127.0.0.1:5173 bun scripts/polish-capture.ts <output directory>
import { appUrl } from './helpers/base-url';
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { authViewports } from './helpers/sign-in';
import { screenProblems, showScreen, tourScreens } from './helpers/screen-tour';

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error('Pass an output directory.');
mkdirSync(outputDirectory, { recursive: true });

const api = await startIsolatedApi();
await api.ws.loadExample('ubl');
await api.ws.loadExample('commerce');
await api.ws.loadExample('mall');
const browser = await chromium.launch();
const screens = tourScreens({ ontology: 'ubl.ontology.yaml', contract: 'commerce.odcs.yaml' });

for (const [width, height] of authViewports) {
  const page = await browser.newPage({ viewport: { width, height } });
  await routeApi(page, api);
  await page.goto(appUrl());
  await page.waitForTimeout(1500);
  for (const screen of screens) {
    await showScreen(page, screen);
    await page.screenshot({ path: `${outputDirectory}/local-${screen.name}-${width}.png` });
    const problems = await screenProblems(page, screen);
    console.log(`MEASURE ${screen.name} ${width} problems=${problems.length}`);
    for (const problem of problems.slice(0, 8)) console.log('   ', problem);
  }
  await page.close();
}
await browser.close();
await api.stop();
