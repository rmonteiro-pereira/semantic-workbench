// Captures lineage click evidence and graph reopen timing. Usage: bun scripts/ui-review/known-issues.ts OUTPUT [FIRST_ATTEMPT] [LAST_ATTEMPT].
// SW_BASE_URL selects the first Vite server; the second server uses a dynamically allocated port and an isolated cache.
import { checkReadableWalks, checkFittedWalk } from '../helpers/odcs-graph-walk';
import { chromium, type Page } from '@playwright/test';
import { mkdirSync, appendFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { startIsolatedApi, routeApi } from '../helpers/isolated-api';
import { fileTab, openFile, showSidebar } from '../helpers/screen-tour';
import { freeLoopbackPort, withCleanup } from '../helpers/processes';

const output = process.argv[2];
const firstAttempt = Number(process.argv[3] ?? 1);
const lastAttempt = Number(process.argv[4] ?? 20);
if (!output) throw new Error('Expected OUTPUT');
mkdirSync(output, { recursive: true });
const api = await startIsolatedApi();
for (const example of ['mall', 'commerce']) await api.ws.loadExample(example);
const browser = await chromium.launch();
let second: ReturnType<typeof Bun.spawn> | undefined;
let secondStart = 0;
let secondServerPid: number | undefined;
let secondPort = 0;
let secondData: string | undefined;
const records = `${output}/known-issues.jsonl`;
const log = (entry: object) => {
  console.log(JSON.stringify(entry));
  appendFileSync(records, JSON.stringify(entry) + '\n');
};

async function pageAt(url: string, width: number, height: number) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(5000);
  await routeApi(page, api);
  page.on('pageerror', error => log({ type: 'browser-error', width, error: error.message }));
  await page.goto(url);
  await page.waitForTimeout(1500);
  return page;
}

async function datasetLineage(page: Page) {
  await fileTab('mall.odcs.yaml', 'Contract')(page);
  const all = page.getByRole('button', { name: 'All tables', exact: true });
  if (await all.isVisible()) await all.click();
  const tables = page.getByRole('button', { name: /^Open / }).filter({ hasText: '' });
  const available = await tables.evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')).filter(Boolean));
  log({ type: 'dataset-options', available });
  await page.getByRole('button', { name: 'Open properties', exact: true }).click();
  await page.getByRole('tab', { name: 'Lineage', exact: true }).click();
  await page.locator('.lineage-card').first().waitFor();
  await page.waitForTimeout(1000);
}

async function lineageEvidence(width: number, height: number) {
  const page = await pageAt(process.env.SW_BASE_URL ?? 'http://127.0.0.1:5190', width, height);
  try {
    await datasetLineage(page);
    const captureWalk = async (stage: string) => {
      await page.screenshot({ path: `${output}/local-lineage-walk--${stage}-${width}.png` });
    };
    await checkReadableWalks(page, captureWalk);
    await checkFittedWalk(page, captureWalk);
    log({ type: 'lineage-walk', width, height, readableClicks: 4, fittedSelection: 'success' });
  } catch (error) {
    log({ type: 'lineage-unreachable', width, height, error: String(error) });
    await page.screenshot({ path: `${output}/local-lineage-walk--failure-${width}.png` });
  } finally {
    await page.close();
  }
}

async function stopSecond() {
  if (secondServerPid) {
    if (second?.pid !== secondServerPid) process.kill(secondServerPid, 'SIGTERM');
    secondServerPid = undefined;
  }
  if (second) {
    second.kill('SIGTERM');
    await second.exited;
    second = undefined;
  }
  if (secondData) {
    rmSync(secondData, { recursive: true, force: true });
    secondData = undefined;
  }
  if (!secondPort) return;
  for (let attempt = 0; attempt < 50; attempt++) {
    const listeners = Bun.spawnSync(['ss', '-ltnH', `sport = :${secondPort}`]);
    if (!listeners.stdout.toString().trim()) return;
    await Bun.sleep(100);
  }
  throw new Error('The second Vite listener did not close after its exact-PID stop');
}

async function startSecond(clearCache: boolean) {
  await stopSecond();
  secondPort = freeLoopbackPort();
  const data = mkdtempSync('/tmp/sw-GATE-second-');
  secondData = data;
  const config = `${data}/vite.config.ts`;
  const baseConfig = JSON.stringify(`${process.cwd()}/vite.config.ts`);
  const cacheDirectory = JSON.stringify(`${data}/vite-cache`);
  writeFileSync(config, `import base from ${baseConfig};\nexport default env => ({ ...base(env), cacheDir: ${cacheDirectory} });\n`);
  secondStart++;
  second = Bun.spawn(['bun', 'x', 'vite-plus', 'dev', '--host', '127.0.0.1', '--strictPort', '--port', String(secondPort), '--config', config], {
    env: { ...process.env, DATA_DIR: data },
    stdout: Bun.file(`${output}/vite-second-${firstAttempt}-${secondStart}.log`),
    stderr: 'inherit',
  });
  log({ type: 'second-start', pid: second.pid, clearCache });
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      if ((await fetch(`http://127.0.0.1:${secondPort}`, { signal: AbortSignal.timeout(1000) })).ok) {
        const listeners = Bun.spawnSync(['ss', '-ltnpH', `sport = :${secondPort}`]);
        const match = listeners.stdout.toString().match(/pid=(\d+)/);
        if (!match) throw new Error('Cannot identify the second Vite listener PID');
        secondServerPid = Number(match[1]);
        log({ type: 'second-listener', pid: secondServerPid });
        return;
      }
    } catch (error) {
      if (attempt === 299) throw error;
    }
    await Bun.sleep(100);
  }
  throw new Error('Second Vite did not become ready');
}

async function reopenEvidence(url: string, attempt: number) {
  const page = await pageAt(url, 1280, 720);
  try {
    await fileTab('mall.ontology.yaml', 'Overview')(page);
    await openFile(page, 'commerce-business.ossie.yaml');
    let navigations = 0;
    let loads = 0;
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) navigations++;
    });
    page.on('load', () => loads++);
    await showSidebar(page);
    await page.getByRole('button', { name: 'mall.ontology.yaml', exact: true }).first().click();
    const start = Date.now();
    await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
    const toolbar = page.locator('.full-graph').getByRole('button', { name: 'Fit model', exact: true });
    let appeared: number | 'missing' = 'missing';
    const observed = toolbar
      .waitFor({ state: 'visible', timeout: 30000 })
      .then(() => {
        appeared = Date.now() - start;
      })
      .catch(error => log({ type: 'toolbar-timeout', attempt, error: String(error) }));
    for (const seconds of [2, 10]) {
      await page.waitForTimeout(Math.max(0, start + seconds * 1000 - Date.now()));
      await page.screenshot({ path: `${output}/local-graph-reopen--attempt-${attempt}-${seconds}s.png` });
    }
    await observed;
    await page.screenshot({ path: `${output}/local-graph-reopen--attempt-${attempt}-end.png` });
    const canvas = await page.locator('.full-graph .react-flow').boundingBox();
    log({ type: 'graph-reopen', attempt, url, appeared, navigations, loads, canvas });
  } catch (error) {
    log({ type: 'graph-unreachable', attempt, url, error: String(error) });
  } finally {
    await page.close();
  }
}

await withCleanup(
  async () => {
    await browser.close();
    await api.stop();
    await stopSecond();
  },
  async () => {
    for (const [width, height] of firstAttempt > 1
      ? []
      : [
          [1280, 720],
          [1440, 900],
          [390, 844],
        ])
      await lineageEvidence(width, height);
    for (let attempt = Math.max(1, firstAttempt); attempt <= Math.min(10, lastAttempt); attempt++) await reopenEvidence(process.env.SW_BASE_URL ?? 'http://127.0.0.1:5190', attempt);
    for (let attempt = Math.max(11, firstAttempt); attempt <= lastAttempt; attempt++) {
      await startSecond(attempt <= 13);
      await reopenEvidence(`http://127.0.0.1:${secondPort}`, attempt);
    }
  },
);
