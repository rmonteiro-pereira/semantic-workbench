// Saves the planned text of one or more documents of a project through the same save path the item editor uses: one file as a patch, several files as one batch.
import { diffPatches } from '../../shared/editor/patch';
import { api, StaleSave, type Doc } from '../projects/api';
import type { Saved } from './ItemEditor';

/** The new text of one document. */
export type DocumentWrite = { doc: Doc; source: string };

/** Writes the documents and returns what each now holds. A stale file raises an error that says nothing was saved. */
export async function saveWrites(project: string, writes: DocumentWrite[]): Promise<Saved[]> {
  try {
    if (writes.length === 1) {
      const { doc, source } = writes[0];
      const saved = await api.save(doc.project, doc.path, doc.hash, source, { patches: diffPatches(doc.source, source) });
      return [{ docId: doc.id, source: saved.source ?? source, hash: saved.hash }];
    }
    const files = writes.map(({ doc, source }) => ({ path: doc.path, baseHash: doc.hash, patches: diffPatches(doc.source, source) }));
    const batch = await api.saveBatch(project, files);
    return writes.map(({ doc, source }, index) => ({ docId: doc.id, source, hash: batch.written[index].hash }));
  } catch (error) {
    if (error instanceof StaleSave) throw new Error('Nothing was saved: a file changed since this opened. Close this and try again.');
    throw error;
  }
}
