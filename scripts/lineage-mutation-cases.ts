/** Exercises viewport predicates from a disposable copy of the production module. */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const targetCompensation = 'Math.max(24, 24 / zoom)';
const reachDecision = '(right - left) * zoom + margin * 2 <= view.width && (bottom - top) * zoom + margin * 2 <= view.height';
const source = await Bun.file(resolve(process.cwd(), 'src/app/odcs/lineage-view.ts')).text();
const candidate = source
  .replace('Math.max(24, 24 / zoom)', targetCompensation)
  .replace('(right - left) * zoom + margin * 2 <= view.width && (bottom - top) * zoom + margin * 2 <= view.height', reachDecision);
const temporary = await mkdtemp('/tmp/sw-B-lineage-case-');
try {
  const path = resolve(temporary, 'lineage-view.ts');
  await writeFile(path, candidate);
  const { walkTargetSize, fitsReadableView } = await import(path);
  assert.equal(walkTargetSize(0.5, 360), 48);
  assert.equal(walkTargetSize(0.05, 360), null);
  const cards = [{ x: 0, y: 0, width: 360, height: 200 }];
  assert.equal(fitsReadableView(cards, { width: 408, height: 248 }, 1, 24), true);
  assert.equal(fitsReadableView(cards, { width: 407, height: 248 }, 1, 24), false);
  assert.equal(fitsReadableView(cards, { width: 408, height: 247 }, 1, 24), false);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
