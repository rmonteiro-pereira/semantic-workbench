import { chromium } from '@playwright/test';
import { resolve } from 'node:path';

const root = '/srv/dev/sw/021-journey/review';
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 5420,
  fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const file = resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
    if (!file.startsWith(root + '/')) return new Response('Invalid path', { status: 400 });
    return new Response(Bun.file(file));
  },
});
console.log('OWNED_PREVIEW_PID', process.pid);
const browser = await chromium.launch();
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto('http://127.0.0.1:5420');
    await page.locator('#search').fill('attribute-dialog');
    await page.screenshot({ path: `${root}/index-${width}.png` });
    await page.close();
  }
} finally {
  await browser.close();
  server.stop(true);
  console.log('STOPPED_PREVIEW_PID', process.pid);
}
