// The guard rules for ontology items, twin to the rules for metrics: approval needs an approver, an approved item is not changed in place, and classification follows the contract rules.
import { applyPatches } from '../editor/patch';
import { type Path } from '../edit/item-model';
import { deepEqual, isObject } from '../edit/source-text';
import { itemValue, valuePatches } from '../edit/yaml-patch';
import { GOVERNANCE_PROPERTY } from '../tessera/additions/governance';
import { ATTRIBUTE_ORDER_PROPERTY } from '../tessera/additions/attributes';
import { tesseraPropertyName } from '../tessera/format';
import type { GuardedChange, GuardedMetric, Level } from './guards';

/**
 * True while every guard rule below is applied on every write path. The governance editor is enabled only while this is true,
 * so no build offers the editor without the rules.
 */
export const ONTOLOGY_GUARDS_ACTIVE = true;

const NOTES_PROPERTY = tesseraPropertyName('notes');

/** An ontology item found in a parsed document, with where it sits. */
type LocatedItem = { path: Path; value: Record<string, any>; kind: 'concept' | 'relationship'; label: string };

/** Reads classification values into levels; the guard module passes its own reader in. */
export type LevelReader = (classification: unknown) => Level;

/** The file a change belongs to, as the guard module describes it. */
type Origin = Pick<GuardedChange, 'project' | 'file'>;

const list = (value: unknown): any[] => (Array.isArray(value) ? value : []);
const pointerOf = (path: Path) => path.map(key => '/' + String(key).replace(/~/g, '~0').replace(/\//g, '~1')).join('');

function governanceEntry(item: Record<string, any>): Record<string, any> {
  const entry = item[GOVERNANCE_PROPERTY];
  return isObject(entry) ? entry : {};
}

/** Every concept and relationship of an ontology document, keyed by name so reordering a list changes nothing. */
function itemsOf(document: any): Map<string, LocatedItem> {
  const found = new Map<string, LocatedItem>();
  if (!isObject(document)) return found;
  list(document.ontology).forEach((concept, conceptIndex) => {
    if (!isObject(concept) || typeof concept.concept !== 'string') return;
    const conceptPath: Path = ['ontology', conceptIndex];
    found.set(`concept:${concept.concept}`, { path: conceptPath, value: concept, kind: 'concept', label: concept.concept });
    list(concept.relationships).forEach((relationship, relationshipIndex) => {
      if (!isObject(relationship) || typeof relationship.name !== 'string') return;
      const label = `${concept.concept}.${relationship.name}`;
      found.set(`relationship:${label}`, { path: [...conceptPath, 'relationships', relationshipIndex], value: relationship, kind: 'relationship', label });
    });
  });
  return found;
}

/** An item as the approved-item rule compares it: everything except what authors may change freely or what has its own rule. */
function comparedBody(item: LocatedItem): unknown {
  const { description: _description, [NOTES_PROPERTY]: _notes, [ATTRIBUTE_ORDER_PROPERTY]: _order, relationships, [GOVERNANCE_PROPERTY]: _governance, ...rest } = item.value;
  const entry = governanceEntry(item.value);
  const kept = { replaced_by: entry.replaced_by, deprecation_reason: entry.deprecation_reason };
  const relationshipNames =
    item.kind === 'concept'
      ? list(relationships)
          .map(relationship => relationship?.name)
          .sort()
      : undefined;
  return { ...rest, governance: kept, relationshipNames };
}

function statusOf(item: LocatedItem | undefined): string {
  const status = item ? governanceEntry(item.value).status : undefined;
  return typeof status === 'string' ? status : '';
}

function peopleOf(item: LocatedItem | undefined): string {
  if (!item) return '';
  const entry = governanceEntry(item.value);
  return JSON.stringify([entry.owner ?? null, entry.steward ?? null]);
}

function ownerKeysOf(versions: (LocatedItem | undefined)[]): string[] {
  const owners = versions.flatMap(version => {
    const owner = version ? governanceEntry(version.value).owner : undefined;
    return typeof owner === 'string' ? [owner.trim().toLowerCase()] : [];
  });
  return [...new Set(owners)].filter(Boolean);
}

function statusChanges(file: Origin, previous: Map<string, LocatedItem>, next: Map<string, LocatedItem>, recorded: Map<string, LocatedItem>): GuardedChange[] {
  const changes: GuardedChange[] = [];
  for (const [key, current] of next) {
    const old = previous.get(key);
    const status = statusOf(current);
    const oldStatus = statusOf(old);
    const metric: GuardedMetric = { name: current.label, status, owners: ownerKeysOf([current, old, recorded.get(key)]) };
    const base = { ...file, pointer: pointerOf(current.path), level: 'public' as Level, metric, itemKind: current.kind };
    const approvalSet = (status === 'approved' || status === 'deprecated') && status !== oldStatus;
    const peopleChanged = oldStatus === 'approved' && status === 'approved' && peopleOf(old) !== peopleOf(current);
    if (approvalSet || peopleChanged) changes.push({ ...base, kind: 'item-status' });
    else if (oldStatus === 'approved' && status === 'approved' && !deepEqual(comparedBody(old!), comparedBody(current))) changes.push({ ...base, kind: 'item-body', demotable: current.path });
  }
  return changes;
}

/** Removing an approved item is a change to it that no demotion can express. */
function removalChanges(file: Origin, previous: Map<string, LocatedItem>, next: Map<string, LocatedItem>): GuardedChange[] {
  const changes: GuardedChange[] = [];
  for (const [key, old] of previous) {
    if (next.has(key) || statusOf(old) !== 'approved') continue;
    const metric: GuardedMetric = { name: old.label, status: 'approved', owners: ownerKeysOf([old]) };
    changes.push({ ...file, pointer: pointerOf(old.path), kind: 'item-body', level: 'public', metric, itemKind: old.kind });
  }
  return changes;
}

/** Classification and protected-level changes, decided like those of data-contract properties. */
function classificationChanges(
  file: Origin,
  previous: Map<string, LocatedItem>,
  next: Map<string, LocatedItem>,
  levelOf: LevelReader,
  protectedAt: number,
  levelNumber: (level: Level) => number,
): GuardedChange[] {
  const changes: GuardedChange[] = [];
  for (const key of new Set([...previous.keys(), ...next.keys()])) {
    const old = previous.get(key);
    const current = next.get(key);
    const oldLevel = levelOf(old ? governanceEntry(old.value).classification : undefined);
    const newLevel = levelOf(current ? governanceEntry(current.value).classification : undefined);
    const level = levelNumber(oldLevel) >= levelNumber(newLevel) ? oldLevel : newLevel;
    const located = current ?? old!;
    const base = { ...file, pointer: pointerOf(located.path), level };
    if (current && !deepEqual(governanceEntry(old?.value ?? {}).classification, governanceEntry(current.value).classification)) changes.push({ ...base, kind: 'classification' });
    // An existing item keeps the protection it had, so lowering its level is still guarded.
    const guardedLevel = old ? oldLevel : level;
    if (levelNumber(guardedLevel) >= protectedAt && !deepEqual(comparedWhole(old), comparedWhole(current))) {
      changes.push({ ...base, level: guardedLevel, kind: 'protected-property' });
    }
  }
  return changes;
}

function comparedWhole(item: LocatedItem | undefined): unknown {
  if (!item) return undefined;
  const { relationships: _relationships, ...rest } = item.value;
  return rest;
}

/** Every governed change a write makes to ontology concepts and relationships. Documents that are not ontologies give none. */
export function ontologyItemChanges(
  file: Origin,
  documents: { before: any; after: any; committed: any },
  rules: { levelOf: LevelReader; protectedLevel: Level; levelNumber: (level: Level) => number },
): GuardedChange[] {
  const previous = itemsOf(documents.before);
  const next = itemsOf(documents.after);
  if (!previous.size && !next.size) return [];
  const recorded = itemsOf(documents.committed);
  const protectedAt = rules.levelNumber(rules.protectedLevel);
  return [...statusChanges(file, previous, next, recorded), ...removalChanges(file, previous, next), ...classificationChanges(file, previous, next, rules.levelOf, protectedAt, rules.levelNumber)];
}

/** The name a guard gives an ontology item: the concept's name, or the concept's name and the relationship's name joined by a dot. */
export function ontologyItemLabel(document: any, path: Path): string | null {
  const concept = document?.ontology?.[path[1] as number];
  if (path[0] !== 'ontology' || typeof concept?.concept !== 'string') return null;
  if (path.length === 2) return concept.concept;
  const relationship = path.length === 4 && path[2] === 'relationships' ? concept.relationships?.[path[3] as number] : undefined;
  return typeof relationship?.name === 'string' ? `${concept.concept}.${relationship.name}` : null;
}

/** Tells whether the item at a path of an ontology document is approved. */
export function isApprovedOntologyItem(item: unknown): boolean {
  return isObject(item) && governanceEntry(item).status === 'approved';
}

/** Sets an approved ontology item back to proposed by patching only its status value. */
export function demoteOntologyItem(source: string, filename: string, itemPath: Path): string {
  const statusPath = [...itemPath, GOVERNANCE_PROPERTY, 'status'];
  const item = itemValue(source, itemPath);
  if (!isObject(item) || !isObject(item[GOVERNANCE_PROPERTY])) return source;
  return applyPatches(source, valuePatches(source, statusPath, 'proposed', filename));
}
