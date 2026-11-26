/** Exercises viewport predicates from a disposable copy of the production module. */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const targetCompensation = 'Math.max(24, 24 / zoom)';
const nameCompensation = 'Math.max(CARD_NAME_PX, NAME_MIN_PX / zoom)';
const reachDecision = '(right - left) * zoom + margin * 2 <= view.width && (bottom - top) * zoom + margin * 2 <= view.height';
const packingDecision = '(OVERVIEW_H - 16) * zoom >= minimumNameHeight';
const packingEligibility = '!cards.every(card => card.overview)';
const capacityPath = resolve(process.cwd(), 'src/app/graph/overview-capacity.ts');
const source = await Bun.file(resolve(process.cwd(), 'src/app/odcs/lineage-view.ts')).text();
const candidate = source
  .replace("from '../graph/overview-capacity'", `from '${capacityPath}'`)
  .replace('Math.max(24, 24 / zoom)', targetCompensation)
  .replace('Math.max(CARD_NAME_PX, NAME_MIN_PX / zoom)', nameCompensation)
  .replace('(right - left) * zoom + margin * 2 <= view.width && (bottom - top) * zoom + margin * 2 <= view.height', reachDecision);
const temporary = await mkdtemp(join(tmpdir(), 'sw-lineage-case-'));
try {
  const path = resolve(temporary, 'lineage-view.ts');
  await writeFile(path, candidate);
  const { walkTargetSize, fitsReadableView, overviewNameSize } = await import(path);
  const layoutSource = await Bun.file(resolve(process.cwd(), 'src/app/odcs/lineage-layout.ts')).text();
  assert.ok(layoutSource.includes('(OVERVIEW_H - 16) * zoom >= minimumNameHeight'), 'The packing mutation must match the production predicate.');
  const layoutCandidate = layoutSource
    .replace("from '../graph/overview-capacity'", `from '${capacityPath}'`)
    .replace("from './lineage-view'", `from '${path}'`)
    .replace('(OVERVIEW_H - 16) * zoom >= minimumNameHeight', packingDecision)
    .replace('!cards.every(card => card.overview)', packingEligibility);
  const layoutPath = resolve(temporary, 'lineage-layout.ts');
  await writeFile(layoutPath, layoutCandidate);
  const { compactOverviewNeedsPacking } = await import(layoutPath);
  const compactCards = [{ id: 'properties', rows: [], portRows: [], more: false, overview: true }];
  const bounds = { width: 4000, height: 2400 };
  assert.equal(compactOverviewNeedsPacking(compactCards, { width: 350, height: 378 }, bounds), true);
  assert.equal(compactOverviewNeedsPacking(compactCards, { width: 1200, height: 700 }, bounds), false);
  assert.equal(compactOverviewNeedsPacking([{ ...compactCards[0], overview: false }], { width: 350, height: 378 }, bounds), false);

  assert.equal(overviewNameSize(1), 14);
  assert.equal(overviewNameSize(0.1) * 0.1, 9);
  assert.equal(walkTargetSize(0.5, 360), 48);
  assert.equal(walkTargetSize(0.05, 360), null);
  const cards = [{ x: 0, y: 0, width: 360, height: 200 }];
  assert.equal(fitsReadableView(cards, { width: 408, height: 248 }, 1, 24), true);
  assert.equal(fitsReadableView(cards, { width: 407, height: 248 }, 1, 24), false);
  assert.equal(fitsReadableView(cards, { width: 408, height: 247 }, 1, 24), false);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
