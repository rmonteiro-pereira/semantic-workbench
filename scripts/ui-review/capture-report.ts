// Summarizes capture evidence without assessing design. Usage: bun scripts/ui-review/capture-report.ts OUTPUT_ROOT.
// Reads manifests and local logs. Writes capture-notes.md; no environment variables.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('Expected OUTPUT_ROOT');
const rows = JSON.parse(readFileSync(root + '/manifest.json', 'utf8')) as any[];
const unreachable = JSON.parse(readFileSync(root + '/unreachable.json', 'utf8')) as string[];
const strip = (text: string) => text.replace(new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g'), '');
const lines = [
  '# Capture evidence',
  '',
  'The gallery and manifests identify native PNG screenshots and failed capture attempts. These records contain observations and measurements only; they do not assess design.',
  '',
  '## Commands',
  '',
  'Working directory: `/home/rodrigo/projetos/semantic-workbench-ui-review-wt`.',
  '',
  '- `bun install --frozen-lockfile`',
  '- `DATA_DIR=$(mktemp -d /tmp/sw-capture-vite-XXXXXX) bun x vite-plus dev --host 127.0.0.1 --strictPort --port 5190`',
  '- `bun run build`',
  `- \`SW_BASE_URL=http://127.0.0.1:5190 bun run polish:capture ${root}/screenshots/local-light\``,
  `- \`SW_BASE_URL=http://127.0.0.1:5190 SW_THEME=dark bun run polish:capture ${root}/screenshots/local-dark\``,
  `- \`bun run polish:capture:server ${root}/screenshots/server-light\``,
  `- \`SW_THEME=dark bun run polish:capture:server ${root}/screenshots/server-dark\``,
];
for (const theme of ['light', 'dark']) lines.push(`- \`SW_BASE_URL=http://127.0.0.1:5190 bun scripts/ui-review/capture-tour.ts ${root}/screenshots/server-${theme} server ${theme}\``);
const commands: Record<string, string> = {
  'empty-graph-states': `${root}/screenshots/states`,
  'file-states': `${root}/screenshots/states`,
  'server-pages': `${root}`,
  'connect-account-states': `${root}/screenshots/auth-pages`,
  'graph-loading-states': `${root}/screenshots/states`,
  'server-contract-states': `${root}`,
  'lineage-panel-states': `${root}/screenshots/states`,
  'lineage-walk-states': `${root}/screenshots/states`,
  'lineage-visibility': `${root}/screenshots/states`,
  'known-issues': `${root}/screenshots/states`,
  'capture-states-graphs': `${root}/screenshots/states graphs`,
  'capture-states-rest': `${root}/screenshots/states rest`,
  'source-control-states': `${root}/screenshots/states`,
  'empty-states': `${root}/screenshots/states`,
  'clone-states': `${root}/screenshots/states`,
  'large-model-states': `${root}/screenshots/states`,
  'admin-states': `${root}/screenshots/states`,
  'last-admin-state': `${root}/screenshots/states`,
};
for (const [name, args] of Object.entries(commands)) {
  if (!existsSync(`${root}/logs/${name}.log`)) continue;
  const script = name.startsWith('capture-states-') ? 'capture-states' : name;
  lines.push(`- \`SW_BASE_URL=http://127.0.0.1:5190 bun scripts/ui-review/${script}.ts ${args}\``);
}
for (const group of ['graphs', 'rest']) {
  for (const theme of ['light', 'dark']) {
    if (!existsSync(`${root}/logs/capture-states-${group}-${theme}.log`)) continue;
    lines.push(`- SW_BASE_URL=http://127.0.0.1:5190 SW_THEME=${theme} bun scripts/ui-review/capture-states.ts ${root}/screenshots/states ${group}`);
  }
}
for (const name of ['empty-states', 'admin-states', 'connect-account-states', 'clone-states']) {
  if (existsSync(`${root}/logs/${name}-continuation.log`)) {
    const folder = name === 'connect-account-states' ? 'auth-pages' : 'states';
    lines.push(`- SW_BASE_URL=http://127.0.0.1:5190 bun scripts/ui-review/${name}.ts ${root}/screenshots/${folder} > ${root}/logs/${name}-continuation.log 2>&1`);
  }
}
if (existsSync(`${root}/logs/neighborhood-supplement.log`)) {
  lines.push(`- SW_BASE_URL=http://127.0.0.1:5190 SW_ONLY=neighborhood bun scripts/ui-review/capture-states.ts ${root}/screenshots/states graphs`);
}
if (existsSync(`${root}/logs/capture-states-rest-dark-continuation.log`)) {
  lines.push(`- SW_BASE_URL=http://127.0.0.1:5190 SW_THEME=dark bun scripts/ui-review/capture-states.ts ${root}/screenshots/states rest > ${root}/logs/capture-states-rest-dark-continuation.log 2>&1`);
}
if (existsSync(`${root}/logs/metrics-light-final.log`))
  lines.push(`- SW_BASE_URL=http://127.0.0.1:5190 SW_THEME=light SW_ONLY=metrics bun scripts/ui-review/capture-states.ts ${root}/screenshots/states rest`);
if (existsSync(`${root}/logs/metrics-dark-final.log`))
  lines.push(`- SW_BASE_URL=http://127.0.0.1:5190 SW_THEME=dark SW_ONLY=metrics bun scripts/ui-review/capture-states.ts ${root}/screenshots/states rest`);
lines.push(`- \`bun scripts/ui-review/catalog-artifacts.ts ${root} sheets\``);
lines.push(
  '',
  'All command output is retained under `logs/`. The second Vite server is started on verified-free port 5191 by the known-issues script; its first three starts clear only this worktree’s node_modules/.vite cache. Every API fixture has temporary data. No browser download was needed.',
  '',
);
lines.push('## Inventory and counts', '', '| Folder | PNG images | Intended tour pairs | Failed screen attempts |', '| --- | ---: | ---: | ---: |');
const tourCoverage: string[] = [];
for (const folder of [...new Set(rows.map(row => row.file.split('/')[1]))].sort()) {
  const images = rows.filter(row => row.file.split('/')[1] === folder);
  const tour = /^(local|server)-(light|dark)$/.test(folder);
  lines.push(`| ${folder} | ${images.length} | ${tour ? 220 : 'Additional states'} | ${images.filter(row => row.state === 'capture-failure').length} |`);
  if (tour) {
    const canonical = images.filter(row => !row.file.includes('--') && !row.file.endsWith('-full.png'));
    const failed = canonical.filter(row => row.state === 'capture-failure').length;
    tourCoverage.push(`- ${folder}: ${canonical.length}/220 canonical pairs; ${canonical.length - failed} intended screens reached; ${failed} retained failure views.`);
  }
}
lines.push('', ...tourCoverage);
lines.push(
  '',
  'The shared stock inventory has 55 screens at four widths. Both local stock runs completed 220/220 pairs. Both server stock runs stopped after 22 images, at query-composer, width 390: a disabled Show query button timed out after 30 seconds. Continuations retain screenshots even when the requested screen cannot be opened. A failed image shows the page at failure, not the named intended state.',
  '',
);
lines.push('## Unreachable states and capture failures', '');
for (const entry of new Set(unreachable)) lines.push('- ' + strip(entry).split('\n')[0]);
lines.push(
  '',
  'Feature limits found in the current implementation: ForeignKeyHops offers 1, 2, and 3 hops; a 5-hop button is absent. Neighborhood has no Fit button. Lineage legends are continuously displayed, rather than opened by a Legend button. Other unsupported control requests are recorded with their selector failures above.',
  '',
);
lines.push('## Measured geometry and browser errors', '');
for (const row of rows.filter(row => row.measured_problems.length)) {
  lines.push(`### ${row.mode} / ${row.screen} / ${row.state} / ${row.theme} / ${row.width}`, '');
  for (const problem of row.measured_problems) lines.push('- ' + strip(problem).split('\n')[0]);
  lines.push('');
}
for (const row of rows.filter(row => row.capture_errors?.length)) {
  lines.push(`### Capture or measurement exception: ${row.mode} / ${row.screen} / ${row.state} / ${row.theme} / ${row.width}`, '');
  for (const error of row.capture_errors) lines.push('- ' + strip(error).split('\n')[0]);
  lines.push('');
}
for (const file of readdirSync(root + '/logs').filter(file => file.endsWith('.log'))) {
  const errors = readFileSync(join(root, 'logs', file), 'utf8')
    .split('\n')
    .filter(line => /^(BROWSER_ERROR|CONSOLE_ERROR)/.test(line));
  if (!errors.length) continue;
  lines.push('### ' + file, '', ...[...new Set(errors)].map(line => '- ' + strip(line)), '');
}
const known = `${root}/screenshots/states/known-issues.jsonl`;
lines.push('## Known-issue investigations', '');
if (existsSync(known)) {
  const records = readFileSync(known, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
  const walks = records.filter(record => record.type === 'lineage-walk');
  lines.push(`Lineage: ${walks.length} button attempts; ${walks.filter(record => record.outcome === 'success').length} successful real clicks.`, '');
  for (const record of records.filter(record => record.type.startsWith('lineage-'))) lines.push('```json', JSON.stringify(record, null, 2), '```', '');
  const reopens = records.filter(record => record.type === 'graph-reopen');
  lines.push(`Graph reopen: ${reopens.length} completed attempts; ${reopens.filter(record => record.appeared === 'missing').length} missing toolbars.`, '');
  lines.push('| Attempt | Server | Toolbar ms | Navigations | Load events | Canvas height |', '| ---: | --- | ---: | ---: | ---: | ---: |');
  for (const record of reopens) lines.push(`| ${record.attempt} | ${record.url} | ${record.appeared} | ${record.navigations} | ${record.loads} | ${record.canvas?.height ?? 'not measured'} |`);
  for (const record of records.filter(record => record.type === 'graph-unreachable')) lines.push('- ' + JSON.stringify(record));
} else lines.push('Pending.');
const visibility = `${root}/screenshots/states/lineage-visibility.jsonl`;
if (existsSync(visibility)) {
  const records = readFileSync(visibility, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
  const walks = records.filter(record => record.type === 'fitted-lineage-walk');
  lines.push('', `After Fit: ${walks.length} neighboring-table click attempts; ${walks.filter(record => record.outcome === 'success').length} successful clicks.`, '');
  for (const record of records) lines.push('```json', JSON.stringify(record, null, 2), '```', '');
  lines.push('The mall contract Graph canvas at 1280×720 is 407 px high, 14 px below the stated expectation of 421 px. The ontology Graph canvas is a different pane and measured 474 px.', '');
}
lines.push(
  'The first second-server launcher left its Vite child alive after the wrapper exited. PID 2568732 was stopped explicitly; port 5191 was verified closed. The investigation resumed at 12. A later direct CLI startup stalled, and a Node launcher was unavailable. Later attempts used the requested launcher in one fresh capture process per attempt, with explicit listener-PID cleanup.',
  '',
  'Resume commands used FIRST_ATTEMPT values 12, 13, and 14. The final loop ran: ' +
    `for attempt in 15 16 17 18 19 20; do bun scripts/ui-review/known-issues.ts ${root}/screenshots/states "$attempt" "$attempt" ` +
    `> "${root}/logs/known-issues-attempt-$attempt.log" 2>&1; done.`,
  '',
  'The first-second-server startup header file was overwritten when numbering resumed; the initial investigation log and attempt-11 measurement remain available.',
  '',
);
lines.push(
  '',
  '## Fixture and capture limitations',
  '',
  '- Additional Admin dialog images use the real temporary server with the loopback mock identity provider. The last-admin fixture uses the repository’s socketless identity transport; access decisions are not mocked.',
  '- Clone connecting images hold the event stream using the existing git-setup check’s method, then release it before real local cloning.',
  '- An empty ontology/contract import was refused by schema validation (at least one ontology/schema item is required). A prefix-only RDF document was also refused (no triples). A description-only RDF document was accepted and is used for empty ontology graph captures. A valid isolated-table contract is used for lineage views without links; it retains its root table.',
  '- Branch menu captures use Space on the native Branch selector. Browser-native popup rendering is not asserted.',
  '- The final metric passes reach all eight wizard steps, including the validation-error view, after choosing a simple metric and an aggregate field.',
  '- Clone results remain in the dialog until Open project is chosen. The first clone pass incorrectly waited for automatic closure; its timeout records remain in logs.',
  '- A sign-in request redirects directly to the mock identity provider; the application has no separate script-free sign-in form.',
  '- Large synthetic graph images use public/examples/commerce/commerce-scale.ttl, the existing large-graph fixture.',
  '- The metric wizard fixture initially opens with a ratio type. The final metric passes explicitly choose simple, then a real aggregate field; the earlier disabled-Next errors remain in logs.',
  '- The first dark rest run was stopped with SIGINT at PID 2853173 after an autocomplete field was incorrectly selected as a textbox. Its log is retained. The continuation uses the field label. The earlier graph preflight logs retain the failed node-container targeting attempt.',
  '- Additional-state geometry uses the generic screen descriptor and checks body text. Modal background text can therefore appear in the recorded coverage strings. These are raw helper outputs, not design conclusions. Stock tours retain their original per-screen descriptors.',
  '- Loading bursts retain all three images; browser screenshot latency is additional to the 150 ms spacing between requests.',
  '',
  '## Process closure and repository status',
  '',
  'Closure verification is appended after the final capture process exits.',
  '',
);
writeFileSync(root + '/capture-notes.md', lines.join('\n'));
console.log('NOTES', rows.length, 'images');
