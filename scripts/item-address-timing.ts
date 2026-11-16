/** Measures inspector overhead against the feature base on the largest synthetic sample. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
const baselineSource = Bun.spawnSync(['git', 'show', '655df09:src/shared/core/model.ts'], { cwd: root });
if (baselineSource.exitCode !== 0) throw new Error('The feature base commit is required for this timing check.');
const original = baselineSource.stdout.toString();
const rewritten = original.replace(/from (['"])(\.[^'"]+)\1/g, (_match, quote, path) => `from ${quote}${resolve(root, 'src/shared/core', path)}${quote}`);
const target = '/tmp/sw-009/model-baseline.ts';
mkdirSync('/tmp/sw-009', { recursive: true });
writeFileSync(target, rewritten);
const before = await import(target);
const after = await import(resolve(root, 'src/shared/core/model.ts'));
const source = readFileSync(resolve(root, 'public/examples/enterprise-1000.ossie.yaml'), 'utf8');
const measure = (operation: () => void) => {
  const start = performance.now();
  operation();
  return performance.now() - start;
};
for (let index = 0; index < 4; index++) {
  before.inspect(source);
  after.inspect(source);
}
const baseline: number[] = [];
const current: number[] = [];
for (let index = 0; index < 15; index++) {
  if (index % 2) {
    current.push(measure(() => after.inspect(source)));
    baseline.push(measure(() => before.inspect(source)));
  } else {
    baseline.push(measure(() => before.inspect(source)));
    current.push(measure(() => after.inspect(source)));
  }
}
const median = (values: number[]) => [...values].sort((first, second) => first - second)[Math.floor(values.length / 2)];
const overheadPercent = (median(current) / median(baseline) - 1) * 100;
console.log(JSON.stringify({ fixture: 'enterprise-1000.ossie.yaml', baselineMs: median(baseline), currentMs: median(current), overheadPercent }));

if (overheadPercent >= 5) throw new Error(`Inspector overhead ${overheadPercent}% exceeds the 5% limit.`);
