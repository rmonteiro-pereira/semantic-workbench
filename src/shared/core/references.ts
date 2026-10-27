/** Matches identities across documents using physical sources, definition URLs and expanded
 * IRIs. */
import { expandIri, prefixMap } from '../validation/iri';
import type { Entity } from './model';
// Identities an entity shares with other documents: physical sources, business definition URLs and
// IRIs. Ossie QNames are expanded with the document prefixes, so `core:Party` and
// `https://…/core#Party` are the same identity.
type ModelLike = { entities: Entity[]; document?: any } | null | undefined;
const usable = (key: unknown): key is string => typeof key === 'string' && key.length > 5;
/** Returns comparable entity identities with declared prefixes expanded. */
export function entityKeys(entity: Entity, model: ModelLike): string[] {
  const d = entity.definition ?? {};
  const keys = [
    d.iri,
    d.source,
    d.physicalName,
    ...(Array.isArray(d.authoritativeDefinitions)
      ? d.authoritativeDefinitions.map((a: any) => a?.url)
      : []),
  ];
  if (typeof d.iri === 'string') {
    const r = expandIri(d.iri, prefixMap(model?.document?.prefixes));
    if ('iri' in r) keys.push(r.iri);
  }
  if (/^https?:/.test(entity.id)) keys.push(entity.id);
  return [...new Set(keys.filter(usable))];
}
/** Collects shared identity keys for a model's entities. */
export const documentKeys = (model: ModelLike) =>
  new Set((model?.entities ?? []).flatMap(e => entityKeys(e, model)));
