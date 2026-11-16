// Captures server contract screens with the stock capture contract preparation. Usage: bun scripts/ui-review/server-contract-states.ts OUTPUT_ROOT.
// Uses a temporary server fixture and loopback mock provider; SW_THEME optionally selects one theme.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync, renameSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGit } from '../../src/server/projects/git';
import { startMockOidc } from '../../tests/helpers/mock-oidc';
import { freeAuthPort, startAuthApi } from '../auth-environment';
import { authViewports, signIn } from '../helpers/sign-in';
import { captureScreens } from '../helpers/all-tours';
import { showScreen, screenProblems } from '../helpers/screen-tour';
import { captureThemes } from './capture-records';

const root = process.argv[2];
if (!root) throw new Error('Expected OUTPUT_ROOT');
const url = `http://127.0.0.1:${freeAuthPort()}`;
const mock = await startMockOidc({ shape: 'entra', layout: 'entra', port: 0, redirectUris: [url + '/auth/callback'] });

async function prepare(directory: string) {
  const path = join(directory, 'projects', 'sales-contracts', 'orders.odcs.yaml');
  writeFileSync(
    path,
    [
      readFileSync(path, 'utf8').trimEnd(),
      '      - name: status',
      '        logicalType: string',
      '        description: Order fulfillment status.',
      'team:',
      '  - username: sales-data',
      '    role: owner',
      '',
    ].join('\n'),
  );
  const projectsRoot = join(directory, 'projects');
  const git = createGit({ projectsRoot });
  const result = await git.commitPaths(join(projectsRoot, 'sales-contracts'), ['orders.odcs.yaml'], 'Prepare visual capture contract');
  if (!result.committed) throw new Error(`Temporary capture fixture commit refused: ${result.reason}`);
}

const api = await startAuthApi(url, { ...mock, kind: 'entra' }, { prepare });
const browser = await chromium.launch();
try {
  for (const theme of captureThemes()) {
    const context = await browser.newContext();
    await context.addInitScript(value => localStorage.setItem('workbench.theme', value), theme);
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    await signIn(page, { url, issuer: mock.endpointBase, kind: 'entra' }, 'dave');
    const screens = captureScreens({ ontology: 'reference.ontology.yaml', contract: 'orders.odcs.yaml', metricsModel: '', mapping: '', serverMode: true });
    const selected = screens.filter(screen => ['odcs-contract-team', 'odcs-property-edit'].includes(screen.name));
    const output = `${root}/screenshots/server-${theme}`;
    const prefix = theme === 'dark' ? 'server-dark' : 'server';
    for (const [width, height] of authViewports) {
      await page.setViewportSize({ width, height });
      for (const screen of selected) {
        try {
          await showScreen(page, screen);
          const problems = await screenProblems(page, screen);
          const path = `${output}/${prefix}-${screen.name}-${width}.png`;
          if (existsSync(path)) renameSync(path, path.replace(`-${width}.png`, `--fixture-missing-${width}.png`));
          await page.screenshot({ path });
          appendFileSync(`${output}/events.jsonl`, JSON.stringify({ file: path, screen: screen.name, width, height, failed: false, problems, captured_at: new Date().toISOString() }) + '\n');
          console.log('CAPTURE', screen.name, theme, width, JSON.stringify(problems));
        } catch (error) {
          console.log('FAIL', screen.name, theme, width, String(error));
        }
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await api.stop();
  await mock.stop();
}
