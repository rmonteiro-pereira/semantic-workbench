/** Cached document models for identity matching and cross-file navigation. */
import { validateInput } from '../../shared/validation/input';
import type { Doc } from '../projects/api';
import { documentKeys } from '../../shared/core/references';
const parsedDocs = new Map<string, { hash: string; model: ReturnType<typeof validateInput>['model']; keys: Set<string> }>();
/** Reuses a parsed model until the document content hash changes. */
export function parsedDoc(doc: Doc) {
  const hit = parsedDocs.get(doc.id);
  if (hit && hit.hash === doc.hash) return hit;
  let model: ReturnType<typeof validateInput>['model'] = null;
  let keys = new Set<string>();
  try {
    model = validateInput(doc.source, doc.filename).model;
    keys = documentKeys(model);
  } catch {}
  const entry = { hash: doc.hash, model, keys };
  parsedDocs.set(doc.id, entry);
  return entry;
}
