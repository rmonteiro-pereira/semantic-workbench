// What an attribute is: a relationship with one role whose concept is a value type. The rule reads the document and nothing is stored.
import { OSSIE_BUILTINS, builtinConcept } from '../mappings/ossie-builtins';

/** The part of a relationship the rule reads. */
export type RelationshipShape = { name?: unknown; roles?: unknown; verbalizes?: unknown; description?: unknown; multiplicity?: unknown; [property: string]: unknown };

/** The part of a concept the rule reads. */
export type ConceptShape = { concept?: unknown; type?: unknown; extends?: unknown; relationships?: unknown; [property: string]: unknown };

/** Answers what kind a concept name is, or nothing when no concept has that name. Imports can supply a wider lookup. */
export type ConceptKindLookup = (conceptName: string) => 'EntityType' | 'ValueType' | undefined;

/** One attribute of a concept as the interface lists it. */
export type AttributeEntry = {
  name: string;
  relationship: RelationshipShape;
  /** The position of the relationship in its concept's list, which is also the last segment of its item address. */
  relationshipIndex: number;
  /** The name of the value type the attribute holds. */
  valueType: string;
  /** The concept that declares the attribute when it is inherited, otherwise nothing. */
  inheritedFrom?: string;
};

/** Builds the lookup for one document: its own concepts first, then the built-in concepts. */
export function conceptKindLookup(concepts: readonly ConceptShape[]): ConceptKindLookup {
  const declared = new Map<string, 'EntityType' | 'ValueType'>();
  for (const concept of concepts) {
    if (typeof concept?.concept !== 'string' || declared.has(concept.concept)) continue;
    declared.set(concept.concept, concept.type === 'ValueType' ? 'ValueType' : 'EntityType');
  }
  return conceptName => {
    const kind = declared.get(conceptName);
    if (kind) return kind;
    return OSSIE_BUILTINS.has(conceptName) ? (builtinConcept(conceptName).type as 'EntityType' | 'ValueType') : undefined;
  };
}

/** The concept names a relationship's roles point at, in order. */
function roleConcepts(relationship: RelationshipShape): string[] {
  if (!Array.isArray(relationship.roles)) return [];
  return relationship.roles.map(role => (typeof role?.concept === 'string' ? role.concept : ''));
}

/** Tells whether a relationship is an attribute: exactly one role, and that role's concept is a value type or a built-in value type. */
export function isAttribute(relationship: RelationshipShape, lookup: ConceptKindLookup): boolean {
  const targets = roleConcepts(relationship);
  return targets.length === 1 && lookup(targets[0]) === 'ValueType';
}

function ownAttributes(concept: ConceptShape, lookup: ConceptKindLookup, inheritedFrom?: string): AttributeEntry[] {
  if (!Array.isArray(concept.relationships)) return [];
  const entries: AttributeEntry[] = [];
  concept.relationships.forEach((relationship: RelationshipShape, relationshipIndex: number) => {
    if (typeof relationship?.name !== 'string' || !isAttribute(relationship, lookup)) return;
    entries.push({ name: relationship.name, relationship, relationshipIndex, valueType: roleConcepts(relationship)[0], inheritedFrom });
  });
  return entries;
}

/** The attributes a concept declares itself, in file order. */
export function declaredAttributesOf(concept: ConceptShape, lookup: ConceptKindLookup): AttributeEntry[] {
  return ownAttributes(concept, lookup);
}

/** The attributes a concept inherits through `extends`, nearest ancestor first. A cycle or a repeated ancestor is followed once. */
export function inheritedAttributesOf(concept: ConceptShape, concepts: readonly ConceptShape[], lookup: ConceptKindLookup): AttributeEntry[] {
  const byName = new Map(concepts.filter(candidate => typeof candidate?.concept === 'string').map(candidate => [candidate.concept as string, candidate]));
  const visited = new Set<string>(typeof concept.concept === 'string' ? [concept.concept] : []);
  const queue = Array.isArray(concept.extends) ? [...concept.extends] : [];
  const inherited: AttributeEntry[] = [];
  while (queue.length) {
    const parentName = queue.shift();
    if (typeof parentName !== 'string' || visited.has(parentName)) continue;
    visited.add(parentName);
    const parent = byName.get(parentName);
    if (!parent) continue;
    inherited.push(...ownAttributes(parent, lookup, parentName));
    if (Array.isArray(parent.extends)) queue.push(...parent.extends);
  }
  return inherited;
}

/** Every attribute a concept shows: its own in file order, then the inherited ones. */
export function attributesOf(concept: ConceptShape, concepts: readonly ConceptShape[], lookup: ConceptKindLookup): AttributeEntry[] {
  return [...declaredAttributesOf(concept, lookup), ...inheritedAttributesOf(concept, concepts, lookup)];
}

/** The types an attribute may hold: the value types the document declares, then the built-in value types that no declared concept shares a name with. */
export function valueTypeChoices(concepts: readonly ConceptShape[]): string[] {
  const declared = concepts.filter(concept => concept?.type === 'ValueType' && typeof concept.concept === 'string').map(concept => concept.concept as string);
  const builtins = [...OSSIE_BUILTINS].sort().filter(name => builtinConcept(name).type === 'ValueType' && !declared.includes(name));
  return [...declared, ...builtins];
}

/** The reading sentence suggested for a new attribute, which the author may change because the standard requires one. */
export function suggestedReading(conceptName: string, attributeName: string): string {
  return `{${conceptName}} has ${attributeName}`;
}
