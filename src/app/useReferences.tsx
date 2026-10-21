/** Matches related documents and cross-file entities by their shared identities. */
import React, { useMemo } from 'react';
import { groupRelationships } from '../graph-view';
import type { Entity } from '../model';
import type { CrossFileTarget } from '../NeighborhoodGraph';
import type { Doc } from '../projects/api';
import { entityKeys } from '../references';
import type { ValidatedModel } from './types';

type Options = {
  docs: Doc[];
  current: Doc | null;
  parsedDoc: (d: Doc) => { hash: string; model: ValidatedModel; keys: Set<string> };
  entity: Entity | undefined;
  model: ValidatedModel;
  selectedEdge: string;
  docsRef: React.RefObject<Map<string, Doc>>;
};
/** Manages references. */
export function useReferences({
  docs,
  current,
  parsedDoc,
  entity,
  model,
  selectedEdge,
  docsRef,
}: Options) {
  // Other documents only: the open file's own identities are never looked up here.
  const documentIdentities = useMemo(
    () => new Map(docs.filter(d => d.id !== current?.id).map(d => [d.id, parsedDoc(d).keys])),
    [docs, current?.id],
  );
  const relatedDocuments = useMemo(() => {
    if (!entity?.definition) return [];
    const keys = entityKeys(entity, model);
    return docs.filter(
      d =>
        d.id !== current?.id &&
        keys.some(
          (key: string) => documentIdentities.get(d.id)?.has(key) || d.source.includes(key),
        ),
    );
  }, [entity, model, docs, documentIdentities, current?.id]);
  const relationship = model?.edges.find(e => e.id === selectedEdge);
  const globalGroups = useMemo(() => groupRelationships(model?.edges ?? []), [model]);
  const activeGroup = globalGroups.find(e => e.data.relationships.some(r => r.id === selectedEdge));
  // Other files of the project that define the same thing: a shared IRI, physical name or business
  // definition, or an Ossie concept mapping and the ontology concept it maps.
  const projectModels = useMemo(
    () =>
      new Map(
        docs
          .filter(d => d.project === current?.project && d.id !== current?.id)
          .flatMap(d => {
            try {
              const projectModelValue = parsedDoc(d).model;
              return projectModelValue ? [[d.id, projectModelValue] as const] : [];
            } catch {
              return [];
            }
          }),
      ),
    [docs, current?.project, current?.id],
  );
  const conceptKinds = new Set(['EntityType', 'ValueType', 'Built-in concept', 'OWL class']);
  function crossFile(e: Entity): CrossFileTarget[] {
    function findMappedEntity(projectModel: NonNullable<ValidatedModel>) {
      if (e.kind === 'Concept mapping') {
        return projectModel.entities.find(x => x.name === e.name && conceptKinds.has(x.kind));
      }
      if (conceptKinds.has(e.kind)) {
        return projectModel.entities.find(x => x.name === e.name && x.kind === 'Concept mapping');
      }
      return undefined;
    }

    const keys = new Set(entityKeys(e, model));
    const targets: CrossFileTarget[] = [];
    for (const [id, m] of projectModels) {
      const document = docsRef.current.get(id);
      if (!document) continue;
      const hit = m.entities.find(x => entityKeys(x, m).some(k => keys.has(k)));
      const mapped = !hit && findMappedEntity(m);
      const target = hit ?? mapped;
      if (target)
        targets.push({
          doc: id,
          file: document.path,
          entity: target.id,
          name: target.name,
          reason: hit
            ? 'Same identity (IRI, physical name or business definition)'
            : 'Ossie mapping reference',
        });
    }
    return targets;
  }

  return { relationship, projectModels, crossFile, activeGroup, relatedDocuments };
}
