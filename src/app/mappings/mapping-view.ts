/** Turns a mapping's resolved context into the rows, cards and lines the Mappings tab shows. */
import type { DocumentRole, RuntimeContext, SelectedContext } from '../../server/agent/runtime';

type Concept = RuntimeContext['concepts'][number];

/** One row of the concept list. */
export type ConceptRow = { concept: string; bindings: number };

/** Counts the bindings that map the concept, as a root or as a nested concept. */
export function bindingCountOf(context: RuntimeContext, concept: string) {
  return context.bindings.filter(binding => binding.rootConcept === concept || binding.concept === concept).length;
}

function matchesTerm(concept: Concept, term: string) {
  const synonyms = Array.isArray(concept.ai_context?.synonyms) ? concept.ai_context.synonyms : [];
  const texts = [concept.concept, concept.description, ...synonyms].filter((text): text is string => typeof text === 'string');
  return texts.some(text => text.toLocaleLowerCase().includes(term));
}

/** Lists the concepts the person can open: those of the ontology, and a built-in only when something binds it. */
export function conceptRows(context: RuntimeContext, searchText: string): ConceptRow[] {
  const term = searchText.toLocaleLowerCase().trim();
  return context.concepts
    .filter(concept => !concept.builtin || bindingCountOf(context, concept.concept) > 0)
    .filter(concept => !term || matchesTerm(concept, term))
    .map(concept => ({ concept: concept.concept, bindings: bindingCountOf(context, concept.concept) }));
}

/** Chooses the concept the tab opens on: the first one that has a binding, or All concepts when none has. */
export function firstConceptToShow(rows: ConceptRow[]) {
  return rows.find(row => row.bindings > 0)?.concept ?? '';
}

/** One cell of the strip that connects ontology, mapping, semantic model and physical sources. */
export type LayerCell = { layer: string; name: string; count: string; file: string };

function plural(count: number, singular: string, pluralForm = singular + 's') {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Describes the four layers of a mapping. The file names come from the documents the mapping reads. */
export function layerCells(context: RuntimeContext, dataContractFiles: string[]): LayerCell[] {
  const fileOf = (role: DocumentRole) => context.documents.find(document => document.role === role)?.filename ?? '';
  const ontologyConcepts = context.concepts.filter(concept => !concept.builtin).length;
  return [
    { layer: 'Ontology', name: context.ontology.name ?? 'Unresolved', count: plural(ontologyConcepts, 'concept'), file: fileOf('ontology') },
    { layer: 'Mapping', name: plural(context.bindings.length, 'binding'), count: '', file: fileOf('mapping') },
    { layer: 'Semantic model', name: context.semanticModel.name ?? 'Unresolved', count: '', file: fileOf('semantic') },
    { layer: 'Physical sources', name: plural(context.datasets.length, 'dataset'), count: '', file: dataContractFiles.join(', ') },
  ];
}

/** Writes an IRI with the ontology's own prefix when one matches and leaves it whole otherwise. The SHACL report shortens to the last segment instead, which would hide the namespace here. */
export function withDeclaredPrefix(iri: string, prefixes: Record<string, string> | undefined) {
  for (const [prefix, base] of Object.entries(prefixes ?? {})) {
    if (typeof base === 'string' && iri.startsWith(base)) return `${prefix}:${iri.slice(base.length)}`;
  }
  return iri;
}

/** What the first card says about the selected concept. */
export type ConceptSummary = { name: string; subtitle: string; definition: string };

/** Reads the concept's name, IRI and definition from the ontology. Without a concept it summarises the whole ontology. */
export function conceptSummary(context: RuntimeContext, concept: string): ConceptSummary {
  if (!concept) {
    return { name: 'All concepts', subtitle: `Ontology · ${context.ontology.name ?? 'Unresolved'}`, definition: context.ontology.description ?? 'The ontology has no description.' };
  }
  const entry = context.concepts.find(candidate => candidate.concept === concept);
  const iri = typeof entry?.iri === 'string' ? withDeclaredPrefix(entry.iri, context.ontology.prefixes) : '';
  return {
    name: concept,
    subtitle: iri ? `Concept · ${iri}` : 'Concept',
    definition: typeof entry?.description === 'string' ? entry.description : 'The ontology gives this concept no definition.',
  };
}

/** Lists the governed metrics the server bound to the concept, or to every concept when none is selected. */
export function boundMetrics(context: SelectedContext) {
  const bound = new Set(context.boundMetricIds);
  return context.metrics.filter(metric => bound.has(metric.id));
}

/** Lists the fields the bindings use and the fields of the bound metrics: what a query for the concept can group by or calculate. */
export function boundFields(context: SelectedContext) {
  const ids = new Set([...context.bindings.flatMap(binding => binding.fields), ...boundMetrics(context).flatMap(metric => metric.fields)]);
  return context.fields.filter(field => ids.has(field.id));
}

/** A dataset with the fields that bindings use in it. */
export type DatasetRow = { dataset: string; fields: string[] };

/** Groups by dataset the fields the bindings use, then the fields of the bound metrics, in the order they are listed. */
export function datasetRows(context: SelectedContext): DatasetRow[] {
  const fieldsById = new Map(context.fields.map(field => [field.id, field]));
  const fieldIds = [...context.bindings.flatMap(binding => binding.fields), ...boundMetrics(context).flatMap(metric => metric.fields)];
  const rows = new Map<string, string[]>();
  for (const id of fieldIds) {
    const field = fieldsById.get(id);
    if (!field) continue;
    const names = rows.get(field.dataset) ?? [];
    if (!names.includes(field.name)) names.push(field.name);
    rows.set(field.dataset, names);
  }
  return [...rows].map(([dataset, fields]) => ({ dataset, fields }));
}

function describeConcept(context: RuntimeContext, concept: string) {
  const entry = context.concepts.find(candidate => candidate.concept === concept);
  const parts: string[] = [];
  if (typeof entry?.description === 'string') parts.push('its definition');
  if (Array.isArray(entry?.ai_context?.synonyms) && entry.ai_context.synonyms.length > 0) parts.push('synonyms');
  if (parts.length === 0) return `${concept}, by name only`;
  return `${concept}, with ${parts.join(' and ')}`;
}

/** Collects the ai_context notes the agent receives for the selected concepts, fields and metrics. */
export function aiContextNotes(context: RuntimeContext): string[] {
  const inScope = new Set([
    ...context.concepts.map(concept => `concept:${concept.concept}`),
    ...context.fields.map(field => `field:${field.dataset}.${field.name}`),
    ...context.metrics.map(metric => `metric:${metric.name}`),
  ]);
  return context.aiContext.filter(note => inScope.has(note.scope)).map(note => `${note.scope}: ${typeof note.value === 'string' ? note.value : JSON.stringify(note.value)}`);
}

/** One line of the card that shows what an agent receives. */
export type AgentContextLine = { label: string; text: string };

/** Describes what the agent API returned for the selection, one line per kind of information. */
export function agentContextLines(context: SelectedContext, concept: string): AgentContextLine[] {
  const datasets = datasetRows(context).length;
  const metrics = context.metrics.length;
  const notes = aiContextNotes(context).length;
  return [
    { label: 'Concept', text: concept ? describeConcept(context, concept) : `${plural(context.concepts.length, 'concept')}, with their definitions` },
    { label: 'Datasets', text: datasets > 0 ? `${plural(datasets, 'dataset')}, each with its fields and keys` : 'No datasets are bound' },
    { label: 'Metrics', text: metrics > 0 ? `${plural(metrics, 'governed metric')} with ${metrics === 1 ? 'its formula' : 'their formulas'}` : 'No governed metrics' },
    { label: 'Notes', text: notes > 0 ? `${plural(notes, 'ai_context note')} written in the files` : 'No ai_context written in the files' },
  ];
}
