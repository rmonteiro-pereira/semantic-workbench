// Checks that a JavaScript error thrown in the page reaches the report route when the server says
// reports are wanted, that nothing is sent when it does not, and that the page only ever talks to
// the workbench itself. The API is mocked: the page's own requests are answered here.
import { chromium, type Page, type Route } from '@playwright/test';
import { appUrl, BASE_URL } from './helpers/base-url';
import { routeApi, startIsolatedApi, type IsolatedApi } from './helpers/isolated-api';

type SentReport = { kind: string; name?: string; message?: string; frames?: string; operation?: string; area?: string; phase?: string; actualDurationMs?: number };
const expectUiProfile = process.env.SW_EXPECT_UI_PROFILE === '1';

const SECRET_TEXT = 'salary-column-for-ana-91000';
let passed = 0;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function check(name: string) {
  passed++;
  console.log('PASS', name);
}

/** Answers /api/me with the real identity plus the server's telemetry switch. */
async function withTelemetrySwitch(api: IsolatedApi, route: Route, enabled: boolean) {
  const response = await route.fetch({ url: `${api.url}/api/me` });
  const identity = await response.json();
  await route.fulfill({ response, json: { ...identity, telemetry: { browserReports: enabled } } });
}

async function openPage(api: IsolatedApi, enabled: boolean) {
  const sent: SentReport[] = [];
  const hosts = new Set<string>();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('request', request => hosts.add(new URL(request.url()).host));
  await routeApi(page, api, async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/me') {
      await withTelemetrySwitch(api, route, enabled);
      return true;
    }
    if (url.pathname === '/api/telemetry/browser') {
      const body = JSON.parse(route.request().postData() ?? '{}');
      sent.push(...body.reports);
      await route.fulfill({ status: 204 });
      return true;
    }
    return false;
  });
  await page.goto(appUrl());
  await page
    .getByRole('button', { name: 'Auto align', exact: true })
    .waitFor()
    .catch(() => {});
  return { browser, page, sent, hosts };
}

async function throwInPage(page: Page, message: string) {
  await page.evaluate(text => {
    setTimeout(() => {
      throw new Error(text);
    }, 0);
  }, message);
}

async function waitForReports(sent: SentReport[], ready: (reports: SentReport[]) => boolean) {
  const deadline = Date.now() + 15_000;
  while (!ready(sent) && Date.now() < deadline) await Bun.sleep(100);
}

async function reportsWhenEnabled(api: IsolatedApi) {
  const { browser, page, sent, hosts } = await openPage(api, true);
  try {
    await throwInPage(page, `Unexpected token "${SECRET_TEXT}" in JSON`);
    await page.evaluate(() => {
      setTimeout(() => void Promise.reject(new TypeError('x is not a function')), 0);
    });
    await waitForReports(sent, reports => reports.some(report => report.kind === 'error') && reports.some(report => report.kind === 'unhandled-rejection'));
    const error = sent.find(report => report.kind === 'error');
    assert(error, 'the thrown error was not reported');
    check('a thrown error reaches the report route');
    assert(error.name === 'Error', 'the error name is kept');
    assert(!JSON.stringify(sent).includes(SECRET_TEXT), 'quoted text must not be sent');
    check('quoted text of the message is replaced before sending');
    const rejection = sent.find(report => report.kind === 'unhandled-rejection');
    assert(rejection?.message === 'x is not a function', 'the unhandled rejection was not reported');
    check('an unhandled rejection reaches the report route');
    assert(
      sent.some(report => report.kind === 'operation'),
      'the page load timing was not reported',
    );
    check('the page load timing is reported');
    for (const report of sent) {
      const keys = Object.keys(report).sort().join(',');
      assert(['frames,kind,message,name', 'kind,message,name', 'durationMs,kind,operation', 'actualDurationMs,area,baseDurationMs,kind,phase'].includes(keys), `unexpected report fields: ${keys}`);
    }
    check('reports carry only the documented fields');
    await checkUiProfile(page, sent);
    const outside = [...hosts].filter(host => host !== new URL(BASE_URL).host);
    assert(outside.length === 0, `the page contacted other hosts: ${outside.join(', ')}`);
    check('the page contacts only the workbench');
  } finally {
    await browser.close();
  }
}

async function checkUiProfile(page: Page, sent: SentReport[]) {
  const measures = await page.evaluate(() =>
    performance
      .getEntriesByType('measure')
      .filter(entry => entry.name.startsWith('sw.react.'))
      .map(entry => entry.name),
  );
  assert(measures.length > 0 === expectUiProfile, `React profiling build mismatch: ${measures.join(', ')}`);
  if (!expectUiProfile) {
    assert(!sent.some(report => report.kind === 'react-render'), 'normal production must not send React timings');
    check('normal production has no React profiling measurements');
    return;
  }
  assert(measures.includes('sw.react.app.mount'), 'production React Profiler did not measure the app mount');
  await page.evaluate(() => {
    document.addEventListener(
      'click',
      () => {
        const end = performance.now() + 260;
        while (performance.now() < end) {
          /* Controlled main-thread stall for Event Timing. */
        }
      },
      { once: true, capture: true },
    );
  });
  await page.getByRole('button', { name: 'Catalog', exact: true }).click();
  await page.waitForFunction(() => performance.getEntriesByName('sw.react.app.update').length > 0);
  const deadline = Date.now() + 15_000;
  while (!sent.some(report => report.operation === 'interaction') && Date.now() < deadline) await Bun.sleep(100);
  assert(
    sent.some(report => report.kind === 'react-render' && report.area === 'app' && typeof report.actualDurationMs === 'number'),
    'React render timing was not reported',
  );
  assert(
    sent.some(report => report.operation === 'interaction'),
    'slow real browser interaction was not reported',
  );
  check('production React renders, updates and slow interactions are measured and reported');
}

async function noReportsWhenDisabled(api: IsolatedApi) {
  const { browser, page, sent } = await openPage(api, false);
  try {
    await throwInPage(page, 'an error nobody should hear about');
    await page.getByRole('button', { name: 'Catalog', exact: true }).click();
    await page.waitForTimeout(4500);
    assert(sent.length === 0, 'reports were sent although the server did not ask for them');
    check('no report is sent when the server has telemetry off');
  } finally {
    await browser.close();
  }
}

const api = await startIsolatedApi({ watch: false });
try {
  await reportsWhenEnabled(api);
  await noReportsWhenDisabled(api);
  console.log(`${passed} telemetry checks passed on isolated data root ${api.root}.`);
} finally {
  await api.stop();
}
