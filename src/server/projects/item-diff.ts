// Compares the definitions and histories captured from two named sides.
import { readDiffSide } from '../auth/item-diff-access';
import { parseStructuredModel } from '../../shared/core/model';
import { UnaddressableItemError } from '../../shared/core/model-addresses';
import { boundDiff } from '../../shared/item-diff/bounds';
import { compareItems } from '../../shared/item-diff/compare-items';
import type { DiffItem, ItemDiff, NotCompared } from '../../shared/item-diff/item-change';
import { itemsOfModel } from '../../shared/item-diff/model-items';
import type { DiffSide } from '../../shared/item-diff/sides';
import { InputError } from '../../shared/validation/diagnostics';
import { addressHistoryDifference } from './address-migrations';
import { SnapshotUnavailableError } from './errors';
import type { createItemDiffSides, LoadedDiffSide } from './item-diff-sides';
import type { Reader } from './reader';

type SideReaders = ReturnType<typeof createItemDiffSides>;

function captureSide(readers: SideReaders, project: string, side: DiffSide, reader: Reader) {
  return readDiffSide(reader, project, () => {
    if (side.name === 'published') return readers.published(project, reader);
    if (side.name === 'working') return readers.working(project, reader);
    if ((side.name === 'branch' || side.name === 'commit') && side.reference) return readers.revision(project, side.name, side.reference, reader);
    throw new SnapshotUnavailableError('unavailable');
  });
}

function parseSide(project: string, captured: LoadedDiffSide, side: NotCompared['side']) {
  const items: DiffItem[] = [];
  const failed: NotCompared[] = captured.unreadable.map(path => ({ path, side, reason: 'Could not read the saved file.' }));
  for (const { path, source } of captured.documents) {
    try {
      const model = parseStructuredModel(source, path);
      if (model) items.push(...itemsOfModel(model, project, path));
      else failed.push({ path, side, reason: 'This format has no structured item addresses.' });
    } catch (error) {
      if (!(error instanceof InputError || error instanceof UnaddressableItemError)) throw error;
      failed.push({ path, side, reason: 'Could not read structured items.' });
    }
  }
  return { items, failed };
}

/** Computes one bounded item comparison from two independently authorized definition sides. */
export async function compareProjectItems(readers: SideReaders, project: string, from: DiffSide, to: DiffSide, reader: Reader): Promise<ItemDiff> {
  const [previous, current] = await Promise.all([captureSide(readers, project, from, reader), captureSide(readers, project, to, reader)]);
  const before = parseSide(project, previous, 'from');
  const after = parseSide(project, current, 'to');
  const notCompared = [...before.failed, ...after.failed];
  const skipped = new Set(notCompared.map(file => file.path));
  const migrations = addressHistoryDifference(previous.records, current.records);
  const changes = compareItems(
    before.items.filter(item => !skipped.has(item.path)),
    after.items.filter(item => !skipped.has(item.path)),
    migrations,
  );
  const counts = { added: 0, removed: 0, changed: 0 };
  for (const change of changes) counts[change.state]++;
  return boundDiff({ from: previous.version, to: current.version, counts, changes, notCompared, omitted: 0 });
}
