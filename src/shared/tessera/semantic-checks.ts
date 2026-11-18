// Findings for the rules a schema cannot state: the order list names attributes, and a governance entry is whole and consistent.
import { isObject } from '../edit/source-text';
import { conceptKindLookup, isAttribute, type ConceptShape, type RelationshipShape } from '../attributes/attribute-rule';
import type { Issue } from '../validation/diagnostics';
import { ATTRIBUTE_ORDER_PROPERTY as ORDER_PROPERTY } from './additions/attributes';
import { GOVERNANCE_KEYS, GOVERNANCE_PROPERTY, GOVERNANCE_STATUSES } from './additions/governance';

function finding(code: string, path: string, message: string): Issue {
  return { severity: 'error', code, path, message };
}

function orderListIssues(concept: ConceptShape, conceptPath: string, concepts: ConceptShape[]): Issue[] {
  const list = concept[ORDER_PROPERTY];
  if (!Array.isArray(list)) return [];
  const lookup = conceptKindLookup(concepts);
  const relationships: RelationshipShape[] = Array.isArray(concept.relationships) ? concept.relationships : [];
  const seen = new Set<string>();
  const issues: Issue[] = [];
  list.forEach((entry, position) => {
    if (typeof entry !== 'string') return;
    const path = `${conceptPath}/${ORDER_PROPERTY}/${position}`;
    const relationship = relationships.find(candidate => candidate?.name === entry);
    if (seen.has(entry)) issues.push(finding('tessera-attribute-order', path, `Entry ${position + 1} of ${ORDER_PROPERTY}, "${entry}", is already listed. List each attribute once.`));
    else if (!relationship) issues.push(finding('tessera-attribute-order', path, `Entry ${position + 1} of ${ORDER_PROPERTY}, "${entry}", is not a relationship of this concept.`));
    else if (!isAttribute(relationship, lookup))
      issues.push(finding('tessera-attribute-order', path, `Entry ${position + 1} of ${ORDER_PROPERTY}, "${entry}", is not an attribute. An attribute has one role and that role is a value type.`));
    seen.add(entry);
  });
  return issues;
}

function deprecationIssues(entry: Record<string, unknown>, path: string, replacementExists: (name: string) => boolean, ownName: unknown): Issue[] {
  const issues: Issue[] = [];
  const deprecated = entry.status === 'deprecated';
  for (const key of ['replaced_by', 'deprecation_reason']) {
    if (key in entry && !deprecated) issues.push(finding('tessera-governance-deprecation', `${path}/${key}`, `${key} is allowed only when the status is deprecated.`));
  }
  const replacement = entry.replaced_by;
  if (deprecated && typeof replacement === 'string' && (replacement === ownName || !replacementExists(replacement))) {
    const reason = replacement === ownName ? 'cannot name the item itself' : 'does not name an existing item of the same kind';
    issues.push(finding('tessera-governance-deprecation', `${path}/replaced_by`, `replaced_by "${replacement}" ${reason}.`));
  }
  return issues;
}

function governanceIssues(entry: unknown, path: string, replacementExists: (name: string) => boolean, ownName: unknown): Issue[] {
  if (!isObject(entry)) return [];
  const keys = Object.keys(entry);
  if (!keys.length) return [finding('tessera-governance-value', path, `${GOVERNANCE_PROPERTY} is empty. Give it at least one of ${GOVERNANCE_KEYS.join(', ')}, or remove it.`)];
  const issues: Issue[] = [];
  for (const key of keys) {
    if (!(GOVERNANCE_KEYS as readonly string[]).includes(key))
      issues.push(finding('tessera-governance-value', `${path}/${key}`, `${key} is not a governance key. Allowed: ${GOVERNANCE_KEYS.join(', ')}.`));
  }
  const status = entry.status;
  if (typeof status === 'string' && !(GOVERNANCE_STATUSES as readonly string[]).includes(status)) {
    issues.push(finding('tessera-governance-value', `${path}/status`, `The status "${status}" is not allowed. Use ${GOVERNANCE_STATUSES.join(', ')}, or leave the status out for "not set".`));
  }
  return [...issues, ...deprecationIssues(entry, path, replacementExists, ownName)];
}

/** Finds the findings of the revision 2 additions in an ontology document. A document of an earlier revision gets none. */
export function additionSemanticIssues(data: unknown, revision: number): Issue[] {
  if (revision < 2 || !isObject(data) || !Array.isArray(data.ontology)) return [];
  const concepts = data.ontology as ConceptShape[];
  const conceptNames = new Set(concepts.map(concept => concept?.concept).filter((name): name is string => typeof name === 'string'));
  const issues: Issue[] = [];
  concepts.forEach((concept, conceptIndex) => {
    if (!isObject(concept)) return;
    const conceptPath = `/ontology/${conceptIndex}`;
    issues.push(...orderListIssues(concept, conceptPath, concepts));
    issues.push(...governanceIssues(concept[GOVERNANCE_PROPERTY], `${conceptPath}/${GOVERNANCE_PROPERTY}`, name => conceptNames.has(name), concept.concept));
    const relationships: RelationshipShape[] = Array.isArray(concept.relationships) ? concept.relationships : [];
    const relationshipNames = new Set(relationships.map(relationship => relationship?.name).filter((name): name is string => typeof name === 'string'));
    relationships.forEach((relationship, relationshipIndex) => {
      if (!isObject(relationship)) return;
      const path = `${conceptPath}/relationships/${relationshipIndex}/${GOVERNANCE_PROPERTY}`;
      issues.push(...governanceIssues(relationship[GOVERNANCE_PROPERTY], path, name => relationshipNames.has(name), relationship.name));
    });
  });
  return issues;
}
