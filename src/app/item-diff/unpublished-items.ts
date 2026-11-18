import { parseStructuredModel } from '../../shared/core/model';
import { UnaddressableItemError } from '../../shared/core/model-addresses';
import { boundDiff } from '../../shared/item-diff/bounds';
import type { ItemDiff } from '../../shared/item-diff/item-change';
import { itemsOfModel } from '../../shared/item-diff/model-items';
import { InputError } from '../../shared/validation/diagnostics';
import type { Doc } from '../projects/api';

/** Lists saved items against an empty baseline while the project has no published commit. */
export function unpublishedItems(project: string, documents: readonly Doc[]): ItemDiff {
  const answer: ItemDiff = {
    from: { side: 'published', version: '' },
    to: { side: 'working', version: '' },
    counts: { added: 0, changed: 0, removed: 0 },
    changes: [],
    notCompared: [],
    omitted: 0,
  };
  const sorted = documents.filter(document => document.project === project).sort((left, right) => left.path.localeCompare(right.path));
  for (const document of sorted) {
    try {
      const model = parseStructuredModel(document.source, document.path);
      if (model) {
        for (const { kind, name, address } of itemsOfModel(model, project, document.path)) {
          answer.changes.push({ kind, name, address, state: 'added', ambiguous: 0, fields: [] });
        }
      } else {
        answer.notCompared.push({ path: document.path, side: 'to', reason: 'This format has no structured item addresses.' });
      }
    } catch (error) {
      if (!(error instanceof InputError || error instanceof UnaddressableItemError)) throw error;
      answer.notCompared.push({ path: document.path, side: 'to', reason: 'Could not read structured items.' });
    }
  }
  answer.counts.added = answer.changes.length;
  return boundDiff(answer);
}
