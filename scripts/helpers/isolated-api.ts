// Routes browser checks to a temporary API workspace without changing the user's data.
import type { Page, Route } from '@playwright/test';
import { rmSync } from 'node:fs';
import { openWorkspace, type Workspace } from '../../src/server/projects/workspace';
import { ALLOWED_ORIGINS, createHandler } from '../../src/server/handler';
import { tempDataDir } from '../../tests/helpers/temp-data-dir';
import { configureLogging } from '../../src/server/observability/log';
// Browser checks run the API on a temporary DATA_DIR (never the user's data/) and send the page's
// /api requests there, whatever the dev server's own API points at.
/** Provides a temporary API workspace, its URL and cleanup operation. */
export type IsolatedApi = {
  root: string;
  url: string;
  ws: Workspace;
  handler: (req: Request) => Promise<Response>;
  restart(options?: { deleteCache?: boolean }): Promise<void>;
  stop(): Promise<void>;
};
/** Starts a temporary API workspace, optionally using the supplied data root. */
export async function startIsolatedApi(options: { root?: string; watch?: boolean; gitBinary?: string } = {}): Promise<IsolatedApi> {
  // Routine request lines would bury a check's own output.
  configureLogging({ level: 'error', format: 'text' });
  const dir = options.root ? { root: options.root, cleanup: () => rmSync(options.root!, { recursive: true, force: true }) } : tempDataDir('workbench-browser-');
  let port = 0;
  const start = async () => {
    const ws = await openWorkspace({
      root: dir.root,
      watch: options.watch ?? true,
      debounceMs: 100,
      gitBinary: options.gitBinary,
    });
    const handler = createHandler(ws);
    const server = Bun.serve({ hostname: '127.0.0.1', port, idleTimeout: 0, fetch: handler });
    port = server.port!;
    return { ws, handler, server };
  };
  let current = await start();
  const api: IsolatedApi = {
    root: dir.root,
    get url() {
      return `http://127.0.0.1:${port}`;
    },
    get ws() {
      return current.ws;
    },
    get handler() {
      return current.handler;
    },
    async restart({ deleteCache = false } = {}) {
      await current.server.stop(true);
      current.ws.close();
      if (deleteCache) for (const s of ['', '-wal', '-shm']) rmSync(current.ws.layout.cache + s, { force: true });
      current = await start();
    },
    async stop() {
      await current.server.stop(true);
      current.ws.close();
      dir.cleanup();
    },
  };
  return api;
}
// Forward every /api request of the page to the isolated API. `intercept` may answer a request
// itself (fault injection) by returning true.
/** Routes page requests to the isolated API; an interceptor may handle a request itself. */
export async function routeApi(page: Page, api: IsolatedApi, intercept?: (route: Route) => Promise<boolean> | boolean) {
  await page.route('**/api/**', async route => {
    if (intercept && (await intercept(route))) return;
    const target = new URL(route.request().url());
    const url = api.url + target.pathname + target.search;
    if (route.request().method() === 'GET') {
      // Reads carry no Origin, and continuing keeps the event stream streaming.
      await route.continue({ url });
      return;
    }
    await forwardWrite(route, url);
  });
}
// The frontend may run on another port than the ones the local API accepts, and the browser does
// not let a route change the Origin of a write. The harness sends writes from Playwright's own
// client with an accepted origin instead, so the API's origin check stays exactly as in production.
async function forwardWrite(route: Route, url: string) {
  const headers = { ...route.request().headers(), origin: ALLOWED_ORIGINS[0] };
  try {
    const response = await route.fetch({ url, headers, maxRedirects: 0 });
    await route.fulfill({ response });
  } catch (error) {
    // A write still in flight when its page or context closes has nobody waiting for it.
    if (/disposed|closed/i.test((error as Error).message)) return;
    throw error;
  }
}
