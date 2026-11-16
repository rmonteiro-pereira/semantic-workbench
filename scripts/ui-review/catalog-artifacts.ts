// Builds manifests, an offline gallery, and JPEG contact sheets. Usage: bun scripts/ui-review/catalog-artifacts.ts OUTPUT_ROOT [sheets].
// Reads existing PNGs and capture logs only. The optional sheets argument launches one Chromium process.
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { chromium } from '@playwright/test';

const root = process.argv[2];
if (!root) throw new Error('Expected OUTPUT_ROOT [sheets]');

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function jsonLines(path: string) {
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

const previousRows = existsSync(root + '/manifest.json') ? JSON.parse(readFileSync(root + '/manifest.json', 'utf8')) : [];
const previousByFile = new Map<string, any>(previousRows.map((row: any) => [row.file, row]));
const events = new Map<string, any>();
const failures: any[] = [];
for (const path of filesUnder(root + '/screenshots').filter(path => path.endsWith('.jsonl'))) {
  for (const event of jsonLines(path)) {
    if (event.file) {
      const name = event.file.split('/').at(-1);
      event.mode ??= name.startsWith('server') ? 'server' : 'local';
      event.theme ??= name.includes('-dark-') ? 'dark' : 'light';
      if (event.mode === 'server') event.user ??= 'dave';
      event.state ??= event.failed ? 'capture-failure' : 'resting';
      events.set(path.includes('/followup/') ? 'followup:' + name : name, event);
    }
    if (event.error && path.endsWith('/failures.jsonl')) failures.push(event);
  }
}
for (const event of events.values()) {
  if (event.failed) failures.push(event);
}
const stockProblems = new Map<string, string[]>();
for (const path of filesUnder(root + '/logs').filter(path => /\/(local|server)-(light|dark)\.log$/.test(path))) {
  const folder = path.split('/').at(-1)!.replace('.log', '');
  let key = '';
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^MEASURE (\S+) (\d+) problems=\d+/);
    if (match) {
      key = `${folder}:${match[1]}:${match[2]}`;
      stockProblems.set(key, []);
    } else if (line.startsWith('    ') && key) stockProblems.get(key)!.push(line.trim());
    else key = '';
  }
}

function captureState(folder: string, event: any, state: string) {
  if (folder !== 'followup' && event?.failed) return 'capture-failure';
  return event?.state ?? state;
}

function imageRow(path: string) {
  const existing = previousByFile.get(relative(root, path));
  if (existing && !path.includes('/followup/')) return existing;
  const name = path.split('/').at(-1)!;
  const folder = relative(root + '/screenshots', path).split('/')[0];
  const bytes = readFileSync(path);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const event = events.get((folder === 'followup' ? 'followup:' : '') + name.replace('-full.png', '.png'));
  let mode = 'local';
  if (name.startsWith('auth-page')) mode = 'auth-page';
  if (name.startsWith('server')) mode = 'server';
  const theme = /^(local|server|auth-page)-dark-/.test(name) ? 'dark' : 'light';
  const prefix = mode + (theme === 'dark' ? '-dark' : '') + '-';
  const body = name.slice(prefix.length).replace(/-\d+(-full)?\.png$/, '');
  const [screen, state = 'resting'] = body.split('--');
  const problems = event?.problems ?? stockProblems.get(`${folder}:${screen}:${width}`) ?? [];
  let source = 'stock tour';
  if (event || name.includes('--fixture-missing')) source = 'capture-tour';
  if (['states', 'auth-pages', 'server-personas', 'known-issues', 'followup'].includes(folder)) source = 'capture-states';
  let user = mode === 'server' ? 'dave' : '';
  if (event?.user) user = event.user;
  if (user === 'admin') user = 'dave';
  return {
    file: relative(root, path),
    screen: event?.screen ?? screen,
    state: captureState(folder, event, state),
    mode,
    user,
    theme,
    width,
    height,
    source,
    measured_problems: problems.filter((problem: string) => !/^(Error|TimeoutError|AssertionError):/.test(problem)),
    capture_errors: problems.filter((problem: string) => /^(Error|TimeoutError|AssertionError):/.test(problem)),
    captured_at: event?.captured_at ?? statSync(path).mtime.toISOString(),
    ...(folder === 'followup' ? { dom_checks: event?.checks ?? null, fresh_context: event?.fresh_context ?? false, capture_error: event?.error ?? '' } : {}),
  };
}

const capturedRows = filesUnder(root + '/screenshots')
  .filter(path => path.endsWith('.png'))
  .sort()
  .map(imageRow);
const rows = [...capturedRows.filter(row => !row.file.startsWith('screenshots/followup/')), ...capturedRows.filter(row => row.file.startsWith('screenshots/followup/'))];
writeFileSync(root + '/manifest.json', JSON.stringify(rows, null, 2));
const columns = ['file', 'screen', 'state', 'mode', 'user', 'theme', 'width', 'height', 'source', 'measured_problems', 'captured_at'];
const csvCell = (value: unknown) => '"' + String(Array.isArray(value) ? JSON.stringify(value) : value).replaceAll('"', '""') + '"';
writeFileSync(root + '/manifest.csv', columns.join(',') + '\n' + rows.map(row => columns.map(column => csvCell(row[column as keyof typeof row])).join(',')).join('\n') + '\n');
const escape = (text: unknown) => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
function captureKey(entry: any) {
  return JSON.stringify([entry.mode, entry.user ?? '', entry.theme, entry.width, entry.screen, entry.state?.replace(/-failed$/, '')]);
}
const successful = new Set([...events.values()].filter(event => !event.failed).map(captureKey));
const unresolvedFailures = failures.filter(entry => !successful.has(captureKey(entry)));
const unreachable = unresolvedFailures.map(
  entry =>
    `${entry.mode ?? ''} ${entry.user ? entry.user + ' ' : ''}${entry.screen ?? ''} ${entry.state ?? ''} ${entry.theme ?? ''} ${entry.width ?? ''}: ${entry.error ?? entry.problems?.join('; ')}`,
);
writeFileSync(root + '/unreachable.json', JSON.stringify(unreachable, null, 2));
const gapGroups = new Map<string, Set<string>>();
for (const entry of unreachable) {
  const [location, ...reason] = entry.split(':');
  const key = location.replace(/ (light|dark) \d+$/, '').trim();
  if (!gapGroups.has(key)) gapGroups.set(key, new Set());
  gapGroups.get(key)!.add(reason.join(':').split('\n')[0].trim());
}
writeFileSync(root + '/unreachable-summary.json', JSON.stringify(Object.fromEntries([...gapGroups].map(([key, reasons]) => [key, [...reasons]])), null, 2));

function gallery() {
  let html = '<!doctype html><meta charset="utf-8"><title>Semantic Workbench captures</title>';
  html +=
    '<style>body{font:16px system-ui;margin:24px;background:#eee;color:#222}input{padding:12px;width:80%}section{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;width:300px;background:white;padding:10px}img{max-width:300px;height:200px;object-fit:contain;object-position:top}figcaption{overflow-wrap:anywhere}h2,h3{width:100%}</style>';
  html +=
    '<h1>Semantic Workbench captures</h1><p><a href="capture-notes.md">Capture notes</a> · <a href="manifest.csv">CSV manifest</a> · <a href="manifest.json">JSON manifest</a> · <a href="unreachable-summary.json">Gap summary</a></p><h2>Unreachable states and failed captures</h2><details><summary>' +
    unreachable.length +
    ' recorded entries</summary><ul>';
  html += unreachable.map(item => '<li>' + escape(item) + '</li>').join('') + '</ul></details>';
  const sheetFiles = filesUnder(root + '/sheets').filter(path => path.endsWith('.jpg'));
  if (sheetFiles.length) {
    html += '<details><summary>JPEG contact sheets (' + sheetFiles.length + ')</summary><ul>';
    html += sheetFiles.map(path => '<li><a href="' + escape(relative(root, path)) + '">' + escape(path.split('/').at(-1)) + '</a></li>').join('');
    html += '</ul></details>';
  }
  html += '<p><input id="filter" placeholder="Filter by mode, screen, state, theme, or width" aria-label="Filter images"></p>';
  for (const mode of ['local', 'server', 'auth-page']) {
    html += '<h2>' + mode + '</h2>';
    const modeRows = rows.filter(row => row.mode === mode);
    for (const screen of [...new Set(modeRows.map(row => row.screen))].sort()) {
      html += '<h3>' + escape(screen) + '</h3><section>';
      for (const row of modeRows
        .filter(row => row.screen === screen)
        .sort((first, second) => first.state.localeCompare(second.state) || first.theme.localeCompare(second.theme) || first.width - second.width)) {
        const caption = `${row.mode} ${row.user} ${row.screen} · ${row.state} · ${row.theme} · ${row.width}×${row.height}`;
        html += `<figure data-filter="${escape(caption.toLowerCase())}"><a href="${escape(row.file)}">`;
        html += `<img loading="lazy" src="${escape(row.file)}" alt="${escape(caption)}"></a>`;
        html += `<figcaption>${escape(caption)}</figcaption></figure>`;
      }
      html += '</section>';
    }
  }
  html +=
    '<script>document.querySelector("#filter").addEventListener("input",function(){const value=this.value.toLowerCase();document.querySelectorAll("figure").forEach(function(figure){figure.hidden=!figure.dataset.filter.includes(value)})})</script>';
  writeFileSync(root + '/index.html', html);
}

gallery();
console.log('MANIFEST', rows.length, 'images', unreachable.length, 'unreachable entries');

async function sheets() {
  mkdirSync(root + '/sheets', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 3600, height: 1800 }, deviceScaleFactor: 1 });
  const groups = new Map<string, typeof rows>();
  for (const row of rows.filter(row => !row.file.endsWith('-full.png'))) {
    const extra = row.file.includes('/states/') ? '-' + row.state : '';
    const person = row.user && row.user !== 'dave' ? '-' + row.user : '';
    const names = new Set([`${row.mode}${person}-${row.screen}`, `${row.mode}${person}-${row.screen}${extra}`]);
    for (const value of names) {
      const name = value.replace(/[^a-zA-Z0-9_-]/g, '-');
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(row);
    }
  }
  try {
    for (const [name, images] of groups) {
      const destination = `${root}/sheets/${name}.jpg`;
      const latestImage = Math.max(...images.map(row => statSync(join(root, row.file)).mtimeMs));
      if (existsSync(destination) && statSync(destination).mtimeMs >= latestImage) continue;
      const tiles: string[] = [];
      for (const theme of ['light', 'dark']) {
        for (const width of [390, 1280, 1440, 2560]) {
          const candidates = images.filter(row => row.theme === theme && row.width === width);
          const row = candidates.find(row => row.state === 'resting') ?? candidates[0];
          if (!row) {
            tiles.push(`<div><p>${theme} ${width}: no capture</p></div>`);
            continue;
          }
          const source = 'data:image/png;base64,' + readFileSync(join(root, row.file)).toString('base64');
          tiles.push(`<div><img src="${source}" style="width:${Math.min(width, 900)}px"><p>${escape(row.screen)} · ${escape(row.state)} · ${theme} · ${width}×${row.height}</p></div>`);
        }
      }
      await page.setContent(
        '<style>body{margin:0;font:20px system-ui;background:#ddd}.grid{display:grid;grid-template-columns:repeat(4,900px);align-items:start}div>div{padding:0;overflow:hidden}img{display:block}p{padding:8px;margin:0}</style><div class="grid">' +
          tiles.join('') +
          '</div>',
      );
      await page.locator('img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
      await page.screenshot({ path: `${root}/sheets/${name}.jpg`, type: 'jpeg', quality: 85, fullPage: true });
      console.log('SHEET', name);
    }
  } finally {
    await browser.close();
  }
}
if (process.argv[3] === 'sheets') await sheets();
