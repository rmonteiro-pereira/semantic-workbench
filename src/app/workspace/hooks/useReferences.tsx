/** Matches related documents and cross-file entities by their shared identities. */
import React, { useMemo } from 'react';
import { groupRelationships } from '../../graph/graph-view';
import type { Entity } from '../../../shared/core/model';
import type { CrossFileTarget } from '../../graph/NeighborhoodGraph';
import type { Doc } from '../../projects/api';
import { entityKeys, relatedDocumentsOf } from '../../../shared/core/references';
import { documentsOfProject } from '../../../shared/core/project-scope';
import type { ValidatedModel } from '../types';

type Options = {
  docs: Doc[];
  project: string;
  current: Doc | null;
  parsedDoc: (doc: Doc) => { hash: string; model: ValidatedModel; keys: Set<string> };
  entity: Entity | undefined;
  model: ValidatedModel;
  selectedEdge: string;
  docsRef: React.RefObject<Map<string, Doc>>;
};
/** Manages references. */
export function useReferences({ docs, project, current, parsedDoc, entity, model, selectedEdge, docsRef }: Options) {
  const projectDocuments = useMemo(() => documentsOfProject(docs, project), [docs, project]);
  // Other documents of the selected project only: the open file's own identities are never looked
  // up here, and another project's files are never related.
  const documentIdentities = useMemo(() => new Map(projectDocuments.filter(d => d.id !== current?.id).map(d => [d.id, parsedDoc(d).keys])), [projectDocuments, current?.id]);
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
          .flatMap(projectDocument => {
            try {
              const parsedModel = parsedDoc(projectDocument).model;
              return parsedModel ? [[projectDocument.id, parsedModel] as const] : [];
            } catch {
              return [];
            }
          }),
      ),
    [projectDocuments, current?.id],
  );
  const conceptKinds = new Set(['EntityType', 'ValueType', 'Built-in concept', 'OWL class']);
  function crossFile(entity: Entity): CrossFileTarget[] {
    function findMappedEntity(projectModel: NonNullable<ValidatedModel>) {
      if (entity.kind === 'Concept mapping') {
        return projectModel.entities.find(x => x.name === entity.name && conceptKinds.has(x.kind));
      }
      if (conceptKinds.has(entity.kind)) {
        return projectModel.entities.find(x => x.name === entity.name && x.kind === 'Concept mapping');
      }
      return undefined;
    }

    const keys = new Set(entityKeys(entity, model));
    const targets: CrossFileTarget[] = [];
    for (const [id, otherModel] of projectModels) {
      const document = docsRef.current.get(id);
      if (!document) continue;
      const hit = otherModel.entities.find(x => entityKeys(x, otherModel).some(k => keys.has(k)));
      const mapped = !hit && findMappedEntity(otherModel);
      const target = hit ?? mapped;
      if (target)
        targets.push({
          doc: id,
          file: document.path,
          entity: target.id,
          name: target.name,
          reason: hit ? 'Same identity (IRI, physical name or business definition)' : 'Ossie mapping reference',
        });
    }
    return targets;
  }

  return { relationship, projectModels, crossFile, activeGroup, relatedDocuments };
}
