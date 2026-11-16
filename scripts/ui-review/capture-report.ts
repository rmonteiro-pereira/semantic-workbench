// Summarizes captured states and compares failures with a baseline. Usage: bun scripts/ui-review/capture-report.ts OUTPUT_ROOT [BASELINE_ROOT].
// Reads manifests from catalog-artifacts.ts and writes capture-notes.md; no environment variables.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type CaptureRow = { file: string };

function readRows(root: string, name: string): CaptureRow[] {
  return JSON.parse(readFileSync(join(root, name), 'utf8'));
}

function readFailures(root: string): string[] {
  return JSON.parse(readFileSync(join(root, 'unreachable.json'), 'utf8'));
}

function failureLocation(entry: string): string {
  return entry.split(': ', 1)[0].replace(/-failed(?= )/g, '');
}

const [root, baseline] = process.argv.slice(2);
if (!root) throw new Error('Expected OUTPUT_ROOT [BASELINE_ROOT]');
const rows = readRows(root, 'manifest.json');
const failures = readFailures(root);
const baselineFailures = baseline ? readFailures(baseline) : [];
const baselineKeys = new Set(baselineFailures.map(failureLocation));
const newFailures = baseline ? failures.filter(row => !baselineKeys.has(failureLocation(row))) : [];
const folders = new Map<string, number>();
for (const row of rows) {
  const folder = row.file.split('/')[1] ?? 'unknown';
  folders.set(folder, (folders.get(folder) ?? 0) + 1);
}
const lines = [
  '# Capture evidence',
  '',
  `${rows.length} PNG images; ${failures.length} failed state attempts.`,
  baseline ? `${newFailures.length} failed states absent from the baseline.` : 'No baseline comparison supplied.',
  '',
  '| Folder | PNG images |',
  '| --- | ---: |',
  ...[...folders].sort(([left], [right]) => left.localeCompare(right)).map(([folder, count]) => `| ${folder} | ${count} |`),
  '',
  '## Failed states',
  '',
];
for (const row of failures) {
  const classification = baselineKeys.has(failureLocation(row)) ? 'also failed in baseline' : 'absent from baseline';
  lines.push(`- ${classification}: ${row.replaceAll('\n', ' ')}`);
}
writeFileSync(join(root, 'capture-notes.md'), lines.join('\n') + '\n');
console.log(`Capture report: ${rows.length} images, ${failures.length} failed attempts, ${newFailures.length} new failed states.`);
if (newFailures.length) process.exitCode = 1;
