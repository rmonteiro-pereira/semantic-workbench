/** Finds the defining relationship behind each mapping reference without guessing an owner. */
import { relationshipMatches } from '../../shared/mappings/relationship-reference';

type Path = (string | number)[];

/** A mapping reference that names a relationship which several concepts could define. */
export type AmbiguousReference = { path: Path; name: string; owners: string[] };

type MappingRelationshipWalk = { targets: Map<string, { owner: string; name: string }>; ambiguous: AmbiguousReference[] };

/** Indexes explicit mapping relationship references by their definition's concept and name. */
export function mappingRelationshipTargets(data: any, ontology: any): Map<string, { owner: string; name: string }> {
  return walkMappingRelationships(data, ontology).targets;
}

/** Lists the mapping references whose relationship cannot be told apart from another concept's, so a rename could not rewrite them safely. */
export function ambiguousMappingRelationships(data: any, ontology: any): AmbiguousReference[] {
  return walkMappingRelationships(data, ontology).ambiguous;
}

function walkMappingRelationships(data: any, ontology: any): MappingRelationshipWalk {
  const concepts = new Map<string, any>((ontology.ontology ?? []).map((concept: any) => [concept.concept, concept]));
  const targets = new Map<string, { owner: string; name: string }>();
  const ambiguous: AmbiguousReference[] = [];
  function relationship(node: any, owner: string, path: Path): string | null {
    if (typeof node?.relationship !== 'string') return owner;
    const resolved = relationshipMatches(concepts, owner, node.relationship);
    if (resolved.matches.length > 1) ambiguous.push({ path: [...path, 'relationship'], name: resolved.name, owners: resolved.matches.map(match => match.owner) });
    if (resolved.matches.length !== 1) return null;
    const match = resolved.matches[0];
    targets.set(JSON.stringify([...path, 'relationship']), { owner: match.owner, name: resolved.name });
    return match.definition.roles?.length === 1 ? match.definition.roles[0].concept : null;
  }
  function object(node: any, owner: string | null, path: Path) {
    if (!node) return;
    const concept = node.concept ?? owner;
    if (!concept) return;
    for (const [index, referent] of (node.referent_mappings ?? []).entries()) {
      const ownPath = [...path, 'referent_mappings', index];
      object(referent, relationship(referent, concept, ownPath), ownPath);
    }
  }
  function link(node: any, owner: string | null, path: Path) {
    if (!node || !owner) return;
    const concept = relationship(node, owner, path);
    object(node.object_mapping, concept, [...path, 'object_mapping']);
    for (const [index, child] of (node.children ?? []).entries()) link(child, node.object_mapping?.concept ?? concept, [...path, 'children', index]);
  }
  function mapping(node: any, prefix: Path) {
    for (const [index, concept] of (node.concept_mappings ?? []).entries()) {
      const path = [...prefix, 'concept_mappings', index];
      for (const [position, item] of (concept.object_mappings ?? []).entries()) object(item, concept.concept, [...path, 'object_mappings', position]);
      for (const [position, item] of (concept.link_mappings ?? []).entries()) link(item, concept.concept, [...path, 'link_mappings', position]);
    }
  }
  if (data.ontology_ref?.name === ontology.name) mapping(data, []);
  if (data === ontology || (data.name === ontology.name && Array.isArray(data.ontology))) {
    for (const [index, node] of (data.ontology_mappings ?? []).entries()) mapping(node, ['ontology_mappings', index]);
  }
  return { targets, ambiguous };
}
