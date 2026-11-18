// Finds the items a counted answer concerns and names each by its canonical address. Everything here
// is a pure function of the answer and the published definition models, so a rule can be tested
// without a workspace.
import { formatAddress, parseAddress } from '../../shared/core/item-address';
import { absoluteItemAddress, addressAtModelPath, resolveInModel } from '../../shared/core/model-addresses';
import { relationshipMatches } from '../../shared/mappings/relationship-reference';
import { semanticModelPaths } from '../../shared/edit/item-model';
import type { StoredDocument } from '../agent/context-types';
import { parseDocuments } from '../agent/context-documents';
import type { ItemRule } from './usage-counted-operations';

/** Most items one request adds to; a mapping context names tens, so the cap only stops hostile sizes. */
export const MAX_ITEMS_PER_REQUEST = 500;

type ModelPath = (string | number)[];
/** Parsed definition documents of one published snapshot, keyed by document id (`<project>/<path>`). */
export type PublishedModels = ReadonlyMap<string, any>;
/** Parses published definition documents into the models used by usage reads and recording. */
export function modelsOfDocuments(documents: readonly StoredDocument[]): PublishedModels {
  return new Map(parseDocuments([...documents]).map(parsed => [parsed.doc.id, parsed.data]));
}

/** Checks that a stored address resolves unambiguously in the supplied published models. */
export function usageAddressExists(models: PublishedModels, text: string): boolean {
  const parsed = parseAddress(text);
  if (!parsed.ok) return false;
  const address = parsed.address;
  if (address.form !== 'absolute' || !address.document || !address.project) return false;
  if (address.snapshot !== undefined || address.chain.some(segment => 'position' in segment)) return false;
  const model = models.get(address.project + '/' + address.document.join('/'));
  if (!model) return false;
  return address.chain.length === 0 || resolveInModel(model, address).status === 'found';
}

/** The file an operation's route named, when the route names one. */
export type RouteTarget = { project?: string; path?: string };
/** The project and file a route named, from its resource; a route that names neither gives an empty target. */
export function routeTarget(resource: { type: string; project?: string; path?: string }): RouteTarget {
  return { ...(resource.project ? { project: resource.project } : {}), ...(resource.path ? { path: resource.path } : {}) };
}
/** Everything an item rule reads. */
export type ItemRuleInput = { answer: any; models: PublishedModels; target: RouteTarget };
/** A location inside one document: where an item lives before it becomes an address. */
type ItemLocation = { documentId: string; path: ModelPath };

/** Names the project an answer belongs to, or undefined when the answer does not say. */
export function answerProject(rule: ItemRule, answer: any, target: RouteTarget): string | undefined {
  if (rule === 'metric') return target.project;
  const mappingId = answer?.mappingId;
  if (typeof mappingId !== 'string' || !mappingId.includes('/')) return undefined;
  return mappingId.slice(0, mappingId.indexOf('/'));
}

/** Lists the distinct canonical addresses a request concerns, sorted and cut at the cap. */
export function itemAddresses(rule: ItemRule, input: ItemRuleInput): string[] {
  const project = answerProject(rule, input.answer, input.target);
  if (!project) return [];
  const locations = locationsFor(rule, input);
  const texts = new Set<string>();
  for (const location of locations) {
    const text = addressText(project, location, input.models);
    if (text) texts.add(text);
  }
  return [...texts].sort().slice(0, MAX_ITEMS_PER_REQUEST);
}

function locationsFor(rule: ItemRule, input: ItemRuleInput): ItemLocation[] {
  if (rule === 'context-items') return contextLocations(input);
  if (rule === 'plan-items') return planLocations(input);
  return metricLocations(input);
}

/** Forms an address from a location, skipping items without a stable name (positional, unknown or too long). */
function addressText(project: string, location: ItemLocation, models: PublishedModels): string | null {
  const model = models.get(location.documentId);
  if (!model || !location.documentId.startsWith(project + '/')) return null;
  try {
    const relative = addressAtModelPath(model, location.path);
    const documentPath = location.documentId.slice(project.length + 1);
    const absolute = absoluteItemAddress(relative, { project, document: documentPath.split('/') });
    if (absolute.chain.some(segment => 'position' in segment)) return null;
    return formatAddress(absolute);
  } catch {
    return null;
  }
}

function pathOf(value: unknown): ModelPath | null {
  return Array.isArray(value) && value.every(part => typeof part === 'string' || typeof part === 'number') ? (value as ModelPath) : null;
}

function evidenceLocation(evidence: any): ItemLocation | null {
  const path = pathOf(evidence?.path);
  if (!path || typeof evidence?.documentId !== 'string') return null;
  return { documentId: evidence.documentId, path };
}

function modelAt(models: PublishedModels, location: ItemLocation): any {
  let value = models.get(location.documentId);
  for (const part of location.path) value = value?.[part];
  return value;
}

/** The document of one role in a context's document list, as the place its model starts. */
function roleLocation(answer: any, role: string): ItemLocation | null {
  const entry = (answer?.documents ?? []).find((document: any) => document?.role === role);
  return evidenceLocation(entry);
}

function indexByName(list: unknown, key: string, name: unknown): number {
  return Array.isArray(list) ? list.findIndex(entry => entry?.[key] === name) : -1;
}

/** A dataset a field belongs to: the field's path without its last two steps. */
function datasetOfField(field: ItemLocation): ItemLocation {
  return { documentId: field.documentId, path: field.path.slice(0, -2) };
}

function datasetsByName(answer: any, models: PublishedModels, names: Iterable<string>): ItemLocation[] {
  const semantic = roleLocation(answer, 'semantic');
  if (!semantic) return [];
  const datasets = modelAt(models, semantic)?.datasets;
  const found: ItemLocation[] = [];
  for (const name of names) {
    const index = indexByName(datasets, 'name', name);
    if (index >= 0) found.push({ documentId: semantic.documentId, path: [...semantic.path, 'datasets', index] });
  }
  return found;
}

/** The concepts and relationships the answer's bindings use, found in the ontology the context read. */
function bindingLocations(answer: any, models: PublishedModels): ItemLocation[] {
  const ontology = roleLocation(answer, 'ontology');
  if (!ontology) return [];
  const concepts: any[] = modelAt(models, ontology)?.ontology ?? [];
  const byName = new Map<string, any>(concepts.map(concept => [concept?.concept, concept]));
  const found: ItemLocation[] = [];
  const conceptAt = (name: string): ItemLocation | null => {
    const index = indexByName(concepts, 'concept', name);
    return index < 0 ? null : { documentId: ontology.documentId, path: [...ontology.path, 'ontology', index] };
  };
  for (const binding of answer?.bindings ?? []) {
    for (const name of [binding?.concept, binding?.rootConcept]) {
      const location = typeof name === 'string' ? conceptAt(name) : null;
      if (location) found.push(location);
    }
    for (const relationship of binding?.relationships ?? []) {
      const location = relationshipLocation(byName, concepts, ontology, binding.rootConcept, relationship);
      if (location) found.push(location);
    }
  }
  return found;
}

function relationshipLocation(byName: Map<string, any>, concepts: any[], ontology: ItemLocation, rootConcept: string, name: unknown): ItemLocation | null {
  if (typeof name !== 'string' || typeof rootConcept !== 'string') return null;
  const resolved = relationshipMatches(byName, rootConcept, name);
  if (resolved.matches.length !== 1) return null;
  const { owner, definition } = resolved.matches[0];
  const conceptIndex = indexByName(concepts, 'concept', owner);
  const relationshipIndex = indexByName(concepts[conceptIndex]?.relationships, 'name', definition.name);
  if (conceptIndex < 0 || relationshipIndex < 0) return null;
  return { documentId: ontology.documentId, path: [...ontology.path, 'ontology', conceptIndex, 'relationships', relationshipIndex] };
}

function contextLocations({ answer, models }: ItemRuleInput): ItemLocation[] {
  const locations: ItemLocation[] = [];
  for (const document of answer?.documents ?? []) {
    const location = evidenceLocation(document);
    if (location) locations.push(location);
  }
  const fields = (answer?.fields ?? []).map((field: any) => evidenceLocation(field?.evidence)).filter((location: ItemLocation | null): location is ItemLocation => location !== null);
  const metrics = (answer?.metrics ?? []).map((metric: any) => evidenceLocation(metric?.evidence)).filter((location: ItemLocation | null): location is ItemLocation => location !== null);
  const datasetNames = (answer?.datasets ?? []).map((dataset: any) => dataset?.name).filter((name: unknown): name is string => typeof name === 'string');
  return [...locations, ...fields, ...metrics, ...fields.map(datasetOfField), ...datasetsByName(answer, models, datasetNames), ...bindingLocations(answer, models)];
}

function planLocations({ answer, models }: ItemRuleInput): ItemLocation[] {
  const metrics = (answer?.metrics ?? []).map((metric: any) => evidenceLocation(metric?.evidence));
  const dimensions = (answer?.dimensions ?? []).map((dimension: any) => evidenceLocation(dimension?.evidence));
  const fields = dimensions.filter((location: ItemLocation | null): location is ItemLocation => location !== null);
  const sourceNames = (answer?.sources ?? []).map((source: any) => source?.dataset).filter((name: unknown): name is string => typeof name === 'string');
  const known = [...metrics, ...fields].filter((location: ItemLocation | null): location is ItemLocation => location !== null);
  return [...known, ...fields.map(datasetOfField), ...datasetsByName(answer, models, sourceNames), ...bindingLocations(answer, models)];
}

function metricLocations({ answer, models, target }: ItemRuleInput): ItemLocation[] {
  if (!target.project || !target.path) return [];
  const documentId = `${target.project}/${target.path}`;
  const metricName = answer?.kpi?.name;
  const document = models.get(documentId);
  if (!document || typeof metricName !== 'string') return [];
  const modelPath = semanticModelPaths(document).find(path => indexByName(modelAtPath(document, path)?.metrics, 'name', metricName) >= 0);
  if (!modelPath) return [];
  const model = modelAtPath(document, modelPath);
  const locations: ItemLocation[] = [];
  const at = (...rest: (string | number)[]): ItemLocation => ({ documentId, path: [...modelPath, ...rest] });
  const addMetric = (name: string) => {
    const index = indexByName(model.metrics, 'name', name);
    if (index >= 0) locations.push(at('metrics', index));
  };
  const addField = (dataset: string, field: string) => {
    const datasetIndex = indexByName(model.datasets, 'name', dataset);
    if (datasetIndex < 0) return;
    locations.push(at('datasets', datasetIndex));
    const fieldIndex = indexByName(model.datasets[datasetIndex]?.fields, 'name', field);
    if (fieldIndex >= 0) locations.push(at('datasets', datasetIndex, 'fields', fieldIndex));
  };
  visitExplanation(answer?.tree, addMetric, addField, 0);
  return locations;
}

function modelAtPath(document: any, path: ModelPath): any {
  let value = document;
  for (const part of path) value = value?.[part];
  return value;
}

// An explanation tree is shallow in practice; the depth bound only guards against a malformed answer.
const MAX_TREE_DEPTH = 64;

function visitExplanation(node: any, addMetric: (name: string) => void, addField: (dataset: string, field: string) => void, depth: number): void {
  if (!node || depth > MAX_TREE_DEPTH) return;
  if (node.kind === 'metric' && typeof node.name === 'string') addMetric(node.name);
  if (node.kind === 'field' && typeof node.name === 'string' && typeof node.dataset === 'string') addField(node.dataset, node.name);
  for (const child of node.children ?? []) visitExplanation(child, addMetric, addField, depth + 1);
}
