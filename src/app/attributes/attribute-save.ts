// Plans the file text of an attribute change: add, edit with rename, and reorder. Nothing is written here; the caller saves the planned text through the item save path.
import { applyPatches } from '../../shared/editor/patch';
import { newItem } from '../../shared/edit/item-model';
import { insertPatches, itemValue, valuePatches } from '../../shared/edit/yaml-patch';
import { orderAfterAdd, orderListOf } from '../../shared/attributes/attribute-order';
import { valueTypeChoices } from '../../shared/attributes/attribute-rule';
import { ATTRIBUTE_ORDER_PROPERTY } from '../../shared/tessera/additions/attributes';
import { validateInput } from '../../shared/validation/input';
import { findReferences, rewriteReferences, unrewritableReferences, type ProjectDoc } from '../edit/references';

type Path = (string | number)[];

/** What the attribute form asks for. */
export type AttributeInput = { name: string; valueType: string; reading: string; description?: string; multiplicity?: string };

/** The new text of each file a change writes, or the reason it cannot be made. */
export type AttributePlan = { writes: { docId: string; source: string }[] } | { refusal: string };

function inputRefusal(input: AttributeInput, document: any, conceptPath: Path, ownPosition?: number): string | null {
  const concepts = document?.ontology ?? [];
  const concept = conceptPath.reduce((node: any, key) => node?.[key], document);
  if (!input.name.trim()) return 'Give the attribute a name.';
  if (!input.reading.trim()) return 'Give the attribute a reading sentence; the standard requires one.';
  if (!valueTypeChoices(concepts).includes(input.valueType)) return `${input.valueType || 'That type'} is not a value type of this document or a built-in value type.`;
  const clash = (concept?.relationships ?? []).findIndex((relationship: any, index: number) => relationship?.name === input.name && index !== ownPosition);
  return clash >= 0 ? `${concept?.concept} already has a relationship named ${input.name}.` : null;
}

function relationshipFrom(input: AttributeInput) {
  return newItem('ontology-relationship', { name: input.name, target: input.valueType, verbalizes: [input.reading], description: input.description, multiplicity: input.multiplicity });
}

function validated(doc: ProjectDoc, source: string): string | null {
  const result = validateInput(source, doc.filename);
  const errors = result.issues.filter(issue => issue.severity === 'error');
  return errors.length ? `The change would not be valid: ${errors[0].message}` : null;
}

/** Adds a relationship that is an attribute, and appends it to the order list when the concept already has one. */
export function planAddAttribute(doc: ProjectDoc, document: any, conceptPath: Path, input: AttributeInput): AttributePlan {
  const refusal = inputRefusal(input, document, conceptPath);
  if (refusal) return { refusal };
  const listPath = [...conceptPath, 'relationships'];
  const list = itemValue(doc.source, listPath);
  const item = relationshipFrom(input);
  let source = applyPatches(doc.source, Array.isArray(list) ? insertPatches(doc.source, listPath, item, undefined, doc.filename) : valuePatches(doc.source, listPath, [item], doc.filename));
  const concept = conceptPath.reduce((node: any, key) => node?.[key], document);
  const order = Object.hasOwn(concept ?? {}, ATTRIBUTE_ORDER_PROPERTY) ? orderListOf(concept) : undefined;
  const nextOrder = orderAfterAdd(order, input.name);
  if (nextOrder) source = applyPatches(source, valuePatches(source, [...conceptPath, ATTRIBUTE_ORDER_PROPERTY], nextOrder, doc.filename));
  const invalid = validated(doc, source);
  return invalid ? { refusal: invalid } : { writes: [{ docId: doc.id, source }] };
}

/** The relationship with the form's values, keeping a second role name and any further readings the author wrote. */
function editedRelationship(current: any, input: AttributeInput) {
  const role = { ...current.roles?.[0], concept: input.valueType };
  const readings = [input.reading, ...(Array.isArray(current.verbalizes) ? current.verbalizes.slice(1) : [])];
  const next: Record<string, unknown> = { ...current, name: input.name, roles: [role], verbalizes: readings };
  for (const [key, value] of [
    ['description', input.description],
    ['multiplicity', input.multiplicity],
  ] as const) {
    if (value) next[key] = value;
    else delete next[key];
  }
  return next;
}

/** Edits an attribute. A new name is rewritten wherever the project refers to it, or the change is refused naming the reference that cannot be rewritten. */
export function planEditAttribute(docs: ProjectDoc[], doc: ProjectDoc, document: any, conceptPath: Path, relationshipIndex: number, input: AttributeInput): AttributePlan {
  const relationshipPath = [...conceptPath, 'relationships', relationshipIndex];
  const current = itemValue(doc.source, relationshipPath);
  const refusal = inputRefusal(input, document, conceptPath, relationshipIndex);
  if (refusal) return { refusal };
  const target = { kind: 'ontology-relationship' as const, name: String(current.name), docId: doc.id, path: relationshipPath };
  const renamed = input.name !== current.name;
  const blockers = renamed ? unrewritableReferences(target, docs) : [];
  if (blockers.length) return { refusal: `${blockers[0].file}:${blockers[0].line} names ${target.name} without saying which concept defines it. Qualify that reference first.` };
  const rewritten = renamed ? rewriteReferences(docs, findReferences(target, docs), input.name) : [];
  const writes = docs.map(candidate => ({ docId: candidate.id, source: rewritten.find(file => file.docId === candidate.id)?.source ?? candidate.source }));
  const own = writes.find(write => write.docId === doc.id)!;
  own.source = applyPatches(own.source, valuePatches(own.source, relationshipPath, editedRelationship(itemValue(own.source, relationshipPath), input), doc.filename));
  const invalid = validated(doc, own.source);
  if (invalid) return { refusal: invalid };
  return { writes: writes.filter(write => write.source !== docs.find(candidate => candidate.id === write.docId)!.source) };
}

/** Writes the order list, naming every own attribute in the shown order. */
export function planReorderAttributes(doc: ProjectDoc, conceptPath: Path, shownOwnNames: string[]): AttributePlan {
  const source = applyPatches(doc.source, valuePatches(doc.source, [...conceptPath, ATTRIBUTE_ORDER_PROPERTY], shownOwnNames, doc.filename));
  const invalid = validated(doc, source);
  return invalid ? { refusal: invalid } : { writes: [{ docId: doc.id, source }] };
}
