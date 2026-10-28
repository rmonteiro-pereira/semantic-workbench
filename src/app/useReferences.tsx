/** Matches related documents and cross-file entities by their shared identities. */
import React, { useMemo } from 'react';
import { groupRelationships } from '../graph/graph-view';
import type { Entity } from '../core/model';
import type { CrossFileTarget } from '../graph/NeighborhoodGraph';
import type { Doc } from '../projects/api';
import { entityKeys, relatedDocumentsOf } from '../core/references';
import { documentsOfProject } from '../core/project-scope';
import type { ValidatedModel } from './types';

type Options = {
  docs: Doc[];
  project: string;
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
  project,
  current,
  parsedDoc,
  entity,
  model,
  selectedEdge,
  docsRef,
}: Options) {
  const projectDocuments = useMemo(() => documentsOfProject(docs, project), [docs, project]);
  // Other documents of the selected project only: the open file's own identities are never looked
  // up here, and another project's files are never related.
  const documentIdentities = useMemo(
    () =>
      new Map(
        projectDocuments.filter(d => d.id !== current?.id).map(d => [d.id, parsedDoc(d).keys]),
      ),
    [projectDocuments, current?.id],
  );
  const relatedDocuments = useMemo(() => {
    if (!entity?.definition || !current) return [];
    const keys = entityKeys(entity, model);
    return relatedDocumentsOf(projectDocuments, current, keys, id => documentIdentities.get(id));
  }, [entity, model, projectDocuments, documentIdentities, current]);
  const relationship = model?.edges.find(e => e.id === selectedEdge);
  const globalGroups = useMemo(() => groupRelationships(model?.edges ?? []), [model]);
  const activeGroup = globalGroups.find(e => e.data.relationships.some(r => r.id === selectedEdge));
  // Other files of the project that define the same thing: a shared IRI, physical name or business
  // definition, or an Ossie concept mapping and the ontology concept it maps.
  const projectModels = useMemo(
    () =>
      new Map(
        projectDocuments
          .filter(d => d.id !== current?.id)
          .flatMap(d => {
            try {
              const projectModelValue = parsedDoc(d).model;
              return projectModelValue ? [[d.id, projectModelValue] as const] : [];
            } catch {
              return [];
            }
          }),
      ),
    [projectDocuments, current?.id],
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
