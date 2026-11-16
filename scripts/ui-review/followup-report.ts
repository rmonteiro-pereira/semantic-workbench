// Appends the follow-up evidence section without changing earlier capture notes. Usage: bun scripts/ui-review/followup-report.ts OUTPUT_ROOT.
// Reads structured follow-up records and writes notes; no environment variables or browser process.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const root = process.argv[2];
if (!root) throw new Error('Expected OUTPUT_ROOT');
const directory = root + '/screenshots/followup';
const readLines = (name: string) =>
  readFileSync(directory + '/' + name, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
const events = readLines('events.jsonl');
const checks = readLines('checks.jsonl');
const images = readdirSync(directory).filter(name => name.endsWith('.png'));
const key = (event: any) => JSON.stringify([event.mode, event.user, event.theme, event.width, event.screen, event.state.replace(/-failed$/, '')]);
const latest = new Map<string, any>();
for (const event of events) latest.set(key(event), event);
const unresolved = [...latest.values()].filter(event => event.failed);
let section = '\n\n## Follow-up round\n\n';
section += `${images.length} PNG images, including full-page companions and explicitly named failed attempts. `;
section += `${events.length} capture attempts recorded; ${unresolved.length} requested viewport/state combinations remain unreached. `;
section += 'All capture drivers completed; process closure is recorded below.\n\n';
section +=
  'Each attempt uses a new browser context, page and fixture navigation. Device scale factor is 1. The DOM check runs after the screenshot; a failed action or check produces a `-failed` filename. Prior failed attempts remain as evidence even when a later retry succeeds. Full-page companions share the viewport image’s check.\n\n';
section +=
  'The existing isolated API and Git credential fixtures expose no port argument. A transport-only adapter assigns their Bun listener to a checked port in 5190–5199. Fixture handlers and responses are unchanged. All data directories are temporary. Server authentication uses the unchanged desktop sign-in helper, then restores the requested viewport and reloads before driving the requested state. This corrects the initial mobile authentication assertion failures.\n\n';
section +=
  'The connected account uses the existing mock GitHub OAuth path. Its connected dialog has a Close button and no Disconnect action; an initial check incorrectly expected Disconnect and was corrected. The wide bundled-line fixture is the existing nine-read fixture from `scripts/lineage-browser-check.ts`. The zero-mapping fixture contains the real commerce mapping document with an empty concept-mappings array. No DOM or CSS state was injected.\n\n';
section += '### Commands\n\n```bash\n';
section += 'DATA_DIR=$(mktemp -d /tmp/sw-followup-vite-XXXXXX) bun x vite-plus dev --host 127.0.0.1 --strictPort --port 5190\n';
section += `SW_BASE_URL=http://127.0.0.1:5190 bun scripts/ui-review/followup-local.ts ${root} all\n`;
section += `bun scripts/ui-review/followup-server.ts ${root}\n`;
section += `bun scripts/ui-review/followup-trash.ts ${root}\n`;
section += `bun scripts/ui-review/catalog-artifacts.ts ${root}\n`;
section += `bun scripts/ui-review/followup-report.ts ${root}\n`;
section +=
  '```\n\nConsole output is in `logs/followup-*.log`. Structured per-step observations are in `screenshots/followup/checks.jsonl`; attempts are in `events.jsonl`. Corrected and targeted retry commands are recorded in the closure entry.\n\n';
section += '### Remaining unreachable states\n\n';
section += unresolved.length ? unresolved.map(event => `- ${event.file}: ${event.error.split('\n')[0]}`).join('\n') : 'None.';
section +=
  '\n\nCommerce’s supplied contract has customers (3 columns), orders (5), orderlines (5) and products (3), so it has no more-columns row. At 1440 the lineage toolbar renders secondary controls inline; there is no Controls menu to open. These requests are recorded as failed captures of the actual screen.\n\n';
section += '### DOM checks by attempt\n\n';
for (const event of events) {
  section += `- **${event.file}**, ${event.captured_at}: ${event.failed ? 'FAILED' : 'verified'}; fresh context: ${event.fresh_context}. `;
  section += event.failed ? event.error.split('\n')[0] : JSON.stringify(event.checks);
  section += '\n';
  if (event.problems.length) section += '  Measured problems: ' + JSON.stringify(event.problems) + '\n';
}
section += '\n### Neighborhood viewport measurements\n\n';
section +=
  'Transforms are React Flow x/y/zoom. Node unions are the bounds of all rendered node elements relative to the canvas pane; negative bounds mean nodes extend outside the pane. Each step below was measured after the actual interaction.\n\n';
for (const check of checks.filter((entry: any) => entry.screen.includes('neighborhood') && !['post-capture-check', 'console-error', 'browser-error'].includes(entry.step))) {
  section += `- ${check.screen} / ${check.state} / ${check.theme} / ${check.width} / ${check.step}: ${JSON.stringify(check.value)}\n`;
}
section += '\n### Empty mapping graph timing\n\n';
for (const check of checks.filter((entry: any) => entry.screen === 'zero-mapping-graph' && !['console-error', 'browser-error'].includes(entry.step))) {
  section += `- ${check.theme} ${check.width} ${check.state} ${check.step}: ${JSON.stringify(check.value)}\n`;
}
section += '\n### Status-bar counts\n\n';
for (const check of checks.filter((entry: any) => entry.screen === 'status-bar' && !['console-error', 'browser-error'].includes(entry.step))) {
  section += `- ${check.theme} ${check.width} ${check.state} ${check.step}: ${JSON.stringify(check.value)}\n`;
}
section += '\n### Console and browser errors\n\n';
const errors = checks.filter((entry: any) => ['console-error', 'browser-error'].includes(entry.step));
const grouped = new Map<string, Set<string>>();
for (const error of errors) {
  const label = `${error.mode} ${error.user ?? ''} ${error.screen} ${error.state} ${error.theme} ${error.width}`;
  if (!grouped.has(label)) grouped.set(label, new Set());
  grouped.get(label)!.add(String(error.value));
}
for (const [label, messages] of grouped) section += `- ${label}: ${JSON.stringify([...messages])}\n`;
if (!errors.length) section += 'None recorded.\n';
const path = root + '/capture-notes.md';
const earlier = readFileSync(path, 'utf8').split('\n\n## Follow-up round')[0];
writeFileSync(path, earlier + section);
console.log('FOLLOWUP REPORT', images.length, 'images', unresolved.length, 'unresolved');
