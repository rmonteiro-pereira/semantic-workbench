// Resolves one mapping entry into a RuntimeContext: finds its ontology and semantic model, collects
// fields, metrics and bindings, and records every problem as a finding instead of failing.
import { relationshipMatches } from '../../shared/mappings/relationship-reference';
import { formatAddress, type Address } from '../../shared/core/item-address';
import { absoluteItemAddress, addressAtModelPath } from '../../shared/core/model-addresses';
import { OSSIE_BUILTINS, builtinConcept } from '../../shared/mappings/ossie-builtins';
import { metricDependencies as syntaxDependencies } from '../../shared/metrics/deps';
import { extensionFormOf, readKpiBindings, workbenchEntry } from '../../shared/metrics/extension';
import { resolveBindings } from '../../shared/metrics/bindings';
import { columnRefs, parseExpression } from './sql';
import { aggregateCalls, datasetMetric, plannerExpression } from './metric-expression';
import { BadRequestError } from '../projects/errors';
import { contextDocument, evidence, fieldKey, policy, type BindingKind, type Evidence, type Finding, type RuntimeContext, type RuntimeField, type RuntimeMetric } from './context-types';
import { identity, targets, type Entry, type Parsed, type Target } from './context-documents';
/** Everything the assembly steps share: the parsed catalog, the mapping entry and the findings being collected. */
type Assembly = {
  parsed: Parsed[];
  entry: Entry;
  findings: Finding[];
  reportError: (code: string, message: string, path?: (string | number)[]) => void;
};
/** Lookups built while collecting definitions, used to resolve mapping expressions. */
type Catalog = {
  concepts: Map<string, any>;
  fields: Map<string, RuntimeField>;
  metrics: Map<string, RuntimeMetric>;
};
type ResolvedTargets = { ontologyTarget: Target | null; semanticTarget: Target | null };
const LOCAL_SCHEME = /^[a-z][a-z\d+.-]*:/i;
function startAssembly(parsed: Parsed[], entry: Entry): Assembly {
  const findings: Finding[] = [];
  const reportError = (code: string, message: string, path: (string | number)[] = entry.path) => {
    findings.push({ severity: 'error', code, message, evidence: evidence(entry.doc, path) });
  };
  return { parsed, entry, findings, reportError };
}
function describeAmbiguousReference(ref: any, label: string, all: Target[], candidates: Target[]) {
  const iriText = ref.iri ? ` at ${ref.iri}` : '';
  const candidateList = candidates.length > 1 ? `: ${candidates.map(identity).join(', ')}` : '';
  const knownIdentities = all.length ? `Local ${label} identities: ${all.map(identity).join(', ')}.` : `No ${label} documents are loaded.`;
  return (
    `${label} reference "${ref.name}"${iriText} resolves to ${candidates.length} local documents${candidateList}. ` +
    `Import the missing document or remove duplicate identities; no target was guessed. ${knownIdentities}`
  );
}
function resolveReference(assembly: Assembly, ref: any, kind: 'ontology' | 'semantic'): Target | null {
  const { entry, findings } = assembly;
  const all = targets(assembly.parsed, kind);
  const label = kind === 'ontology' ? 'ontology' : 'semantic model';
  let candidates = all.filter(t => t.data.name === ref.name);
  if (ref.iri && !LOCAL_SCHEME.test(ref.iri)) {
    const local = ref.iri.replace(/^\.\//, '');
    if (local.includes('/') || local.includes('\\') || local === '..') {
      assembly.reportError('reference', `Cannot resolve relative location ${ref.iri} in the flat local catalog. Import the target with a matching filename and update the reference.`);
      return null;
    }
    candidates = candidates.filter(t => t.doc.filename === local);
  }
  // Prefer candidates in the mapping’s project before considering other projects.
  const own = entry.doc.project === undefined ? [] : candidates.filter(t => t.doc.project === entry.doc.project);
  if (own.length) candidates = own;
  if (candidates.length !== 1) {
    assembly.reportError('reference', describeAmbiguousReference(ref, label, all, candidates));
    return null;
  }
  if (ref.iri && LOCAL_SCHEME.test(ref.iri))
    findings.push({
      severity: 'warning',
      code: 'local-resolution',
      message: `Resolved ${ref.name} by its unique logical name in the local catalog. Remote location ${ref.iri} was not fetched.`,
      evidence: evidence(entry.doc),
    });
  return candidates[0];
}
/** Finds the ontology and semantic model a mapping reads: embedded ones directly, referenced ones by logical name. */
function resolveTargets(assembly: Assembly): ResolvedTargets {
  const { entry } = assembly;
  const ontologyTarget = entry.ontology ? { ...entry.ontology, path: [] } : resolveReference(assembly, entry.data.ontology_ref, 'ontology');
  const semanticTarget: Target | null = entry.ontology
    ? {
        doc: entry.doc,
        data: entry.data.semantic_model,
        path: entry.semanticPath ?? [...entry.path, 'semantic_model'],
      }
    : resolveReference(assembly, entry.data.semantic_model_ref, 'semantic');
  return { ontologyTarget, semanticTarget };
}
/** The context before any field, metric or binding is collected; it is also the result when a target is missing. */
function emptyContext(assembly: Assembly, { ontologyTarget, semanticTarget }: ResolvedTargets): RuntimeContext {
  const { entry, findings } = assembly;
  const ontology = ontologyTarget?.data ?? {};
  const model = semanticTarget?.data ?? {};
  const semanticPrefix = semanticTarget?.path ?? [];
  const declaredConcepts: any[] = ontology.ontology ?? [];
  const scopeAddress = (target: Target | null, kind: 'ontology' | 'model') => {
    if (!target) return {};
    const document = assembly.parsed.find(candidate => candidate.doc.id === target.doc.id)?.data;
    const relative = addressAtModelPath(document, target.path);
    const project = target.doc.project;
    const path = project && target.doc.id.startsWith(project + '/') ? target.doc.id.slice(project.length + 1) : target.doc.filename;
    const address = project ? absoluteItemAddress(relative, { project, document: path.split('/') }) : relative;
    return address.chain.at(-1)?.kind === kind ? { address } : {};
  };
  const builtinConcepts = [...OSSIE_BUILTINS].filter(name => !declaredConcepts.some(c => c.concept === name)).map(builtinConcept);
  return {
    mappingId: entry.id,
    name: entry.data.name ?? entry.doc.filename,
    documents: [
      contextDocument('mapping', entry.doc, entry.path),
      ...(ontologyTarget ? [contextDocument('ontology', ontologyTarget.doc)] : []),
      ...(semanticTarget ? [contextDocument('semantic', semanticTarget.doc, semanticPrefix)] : []),
    ],
    mapping: {
      conceptMappings: entry.data.concept_mappings,
      ontologyRef: entry.data.ontology_ref,
      semanticModelRef: entry.data.semantic_model_ref,
      description: entry.data.description,
      // The field keeps its name; a 0.3 draft mapping supplies its nonportable_extensions here.
      customExtensions: entry.data[extensionFormOf(entry.data).list],
      embedded: !!entry.ontology,
      evidence: evidence(entry.doc, entry.path),
    },
    ontology: {
      ...scopeAddress(ontologyTarget, 'ontology'),
      name: ontology.name,
      description: ontology.description,
      requires: ontology.requires,
      prefixes: ontology.prefixes,
    },
    semanticModel: { ...scopeAddress(semanticTarget, 'model'), name: model.name, description: model.description, version: model.version },
    concepts: [...declaredConcepts, ...builtinConcepts],
    bindings: [],
    fields: [],
    metrics: [],
    datasets: model.datasets ?? [],
    joins: model.relationships ?? [],
    aiContext: [],
    findings,
    metricBindings: [],
    policy,
  };
}
function definitionLabel(scope: Address, model: any, path: (string | number)[] = []): string {
  const relative = addressAtModelPath(model, path);
  return formatAddress({ ...scope, chain: [...scope.chain, ...relative.chain.slice(1)] });
}
function ontologyItemEvidence(target: Target, path: (string | number)[]): Evidence {
  const source = target.unitEvidence?.get(path.join('/'));
  return source ? evidence(source.doc, source.path) : evidence(target.doc, path);
}

function addAiContext(context: RuntimeContext, definition: any, scope: string, definitionEvidence: Evidence) {
  if (definition?.ai_context !== undefined) context.aiContext.push({ scope, value: definition.ai_context, evidence: definitionEvidence });
}
/** Registers each dataset field and the AI context of the ontology, model, concepts, datasets and fields. */
function collectFields(context: RuntimeContext, catalog: Catalog, { ontologyTarget, semanticTarget }: { ontologyTarget: Target; semanticTarget: Target }) {
  const semanticPrefix = semanticTarget.path;
  if (context.ontology.address) addAiContext(context, ontologyTarget.data, formatAddress(context.ontology.address), evidence(ontologyTarget.doc));
  addAiContext(context, semanticTarget.data, formatAddress(context.semanticModel.address), evidence(semanticTarget.doc, semanticPrefix));
  context.concepts.forEach((concept, i) => {
    if (concept.ai_context !== undefined)
      addAiContext(context, concept, definitionLabel(context.ontology.address, ontologyTarget.data, ['ontology', i]), ontologyItemEvidence(ontologyTarget, ['ontology', i]));
    (concept.relationships ?? []).forEach((relationship: any, j: number) => {
      const path = ['ontology', i, 'relationships', j];
      if (relationship?.ai_context !== undefined) addAiContext(context, relationship, definitionLabel(context.ontology.address, ontologyTarget.data, path), ontologyItemEvidence(ontologyTarget, path));
    });
  });
  context.datasets.forEach((dataset, i) => {
    addAiContext(context, dataset, definitionLabel(context.semanticModel.address, semanticTarget.data, ['datasets', i]), evidence(semanticTarget.doc, [...semanticPrefix, 'datasets', i]));
    (dataset.fields ?? []).forEach((field: any, j: number) => {
      const fieldEvidence = evidence(semanticTarget.doc, [...semanticPrefix, 'datasets', i, 'fields', j]);
      const runtimeField = {
        id: fieldKey(context.semanticModel.address, dataset.name, field.name),
        dataset: dataset.name,
        name: field.name,
        definition: field,
        evidence: fieldEvidence,
      };
      catalog.fields.set(runtimeField.id, runtimeField);
      context.fields.push(runtimeField);
      addAiContext(context, field, runtimeField.id, fieldEvidence);
    });
  });
}
/** Registers the governed metrics and the AI context of metrics and joins. Dependencies are resolved later. */
function collectMetrics(context: RuntimeContext, catalog: Catalog, semanticTarget: Target) {
  const semanticPrefix = semanticTarget.path;
  (semanticTarget.data?.metrics ?? []).forEach((metricDefinition: any, i: number) => {
    const metricEvidence = evidence(semanticTarget.doc, [...semanticPrefix, 'metrics', i]);
    const metric = {
      id: metricDefinition.name,
      name: metricDefinition.name,
      definition: metricDefinition,
      fields: [] as string[],
      datasets: [] as string[],
      dependsOn: [] as string[],
      evidence: metricEvidence,
    };
    catalog.metrics.set(metricDefinition.name, metric);
    context.metrics.push(metric);
    addAiContext(context, metricDefinition, definitionLabel(context.semanticModel.address, semanticTarget.data, ['metrics', i]), metricEvidence);
  });
  context.joins.forEach((join, i) =>
    addAiContext(context, join, definitionLabel(context.semanticModel.address, semanticTarget.data, ['relationships', i]), evidence(semanticTarget.doc, [...semanticPrefix, 'relationships', i])),
  );
}
type ExpressionRefs = { fields: string[]; metrics: string[]; condition: unknown };
/**
 * Resolves the fields and metrics an expression names, refusing unknown or ambiguous references.
 * Inside a dataset metric, `scope` is its dataset, which unqualified names belong to. An
 * AGG(dataset.metric) call contributes the fields of that dataset metric.
 */
function resolveExpressionRefs(context: RuntimeContext, catalog: Catalog, expression: string, scope?: string): ExpressionRefs {
  const ast = parseExpression(expression, { conditional: true });
  const fieldMap = catalog.fields;
  const fields = new Set<string>();
  const metrics = new Set<string>();
  const aggregates = aggregateCalls(ast.expression);
  for (const call of aggregates) {
    const definition = datasetMetric(context.datasets, call.dataset, call.metric);
    const inner = plannerExpression(definition);
    if (!inner) throw new BadRequestError(`Dataset metric ${call.dataset}.${call.metric} has no sql or ANSI_SQL expression.`);
    for (const id of resolveExpressionRefs(context, catalog, inner, call.dataset).fields) fields.add(id);
  }
  const aggregateArguments = new Set(aggregates.map(call => call.argument));
  for (const ref of columnRefs([ast.expression, ast.condition])) {
    if (aggregateArguments.has(ref.node)) continue;
    if (!ref.table && scope) {
      const id = fieldKey(context.semanticModel.address, scope, ref.column);
      if (!fieldMap.has(id)) throw new BadRequestError(`Unknown field ${ref.column} of dataset ${scope}.`);
      fields.add(id);
    } else if (ref.table) {
      const id = fieldKey(context.semanticModel.address, ref.table, ref.column);
      if (!fieldMap.has(id)) throw new BadRequestError(`Unknown semantic field ${ref.table}.${ref.column}. Mapping expressions must use declared logical fields.`);
      fields.add(id);
    } else if (catalog.metrics.has(ref.column)) metrics.add(ref.column);
    else {
      const options = context.fields.filter(f => f.name === ref.column);
      if (options.length !== 1) throw new BadRequestError(`Unqualified reference ${ref.column} resolves to ${options.length} fields. Qualify it with a dataset name.`);
      fields.add(options[0].id);
    }
  }
  return { fields: [...fields], metrics: [...metrics], condition: ast.condition };
}
/** Fills each metric's fields, datasets and dependencies from its ANSI_SQL expression. A failing metric becomes a finding. */
function resolveMetricDependencies(assembly: Assembly, context: RuntimeContext, catalog: Catalog) {
  const metricMap = catalog.metrics;
  // Governed metric dependencies form their own graph; detect cycles before traversal.
  const completed = new Set<string>();
  const metricDependencies = (name: string, active = new Set<string>()): RuntimeMetric => {
    const metric = metricMap.get(name)!;
    if (completed.has(name)) return metric;
    if (active.has(name)) throw new BadRequestError(`Governed metric dependency cycle at ${name}.`);
    if (active.size > 64) throw new BadRequestError('Metric dependency depth exceeds 64.');
    const next = new Set(active);
    next.add(name);
    const selected = plannerExpression(metric.definition);
    if (!selected) throw new BadRequestError(`Metric ${name} has no ANSI_SQL expression; choose a supported dialect before planning.`);
    const refs = resolveExpressionRefs(context, catalog, selected);
    metric.dependsOn = syntaxDependencies(selected, new Set(metricMap.keys()));
    const fields = new Set(refs.fields);
    for (const dep of refs.metrics) for (const id of metricDependencies(dep, next).fields) fields.add(id);
    metric.fields = [...fields];
    metric.datasets = [...new Set(metric.fields.map(id => catalog.fields.get(id)!.dataset))];
    completed.add(name);
    return metric;
  };
  for (const metric of context.metrics)
    try {
      metricDependencies(metric.name);
    } catch (error) {
      assembly.findings.push({
        severity: 'error',
        code: 'metric',
        message: (error as Error).message,
        evidence: metric.evidence,
      });
    }
}
function inheritedRelationship(concepts: Map<string, any>, concept: string, name: string): any {
  const resolved = relationshipMatches(concepts, concept, name);
  if (resolved.matches.length !== 1) throw new BadRequestError(`Relationship ${resolved.concept}.${resolved.name} resolves to ${resolved.matches.length} definitions (including inheritance).`);
  return resolved.matches[0].definition;
}
type MappingTask = {
  node: any;
  path: (string | number)[];
  concept: string;
  rootConcept: string;
  relationships: string[];
  kind: BindingKind;
  depth: number;
  inLink?: boolean;
};
/** The queue of mapping nodes still to read, plus what the reading needs. */
type MappingWalk = { assembly: Assembly; context: RuntimeContext; catalog: Catalog; queue: MappingTask[] };
/** Queues the top-level object and link mappings of every concept mapping. */
function seedMappingTasks({ assembly, catalog, queue }: MappingWalk) {
  const { entry } = assembly;
  (entry.data.concept_mappings ?? []).forEach((conceptMapping: any, i: number) => {
    const mappingPath = [...entry.path, 'concept_mappings', i];
    if (!catalog.concepts.has(conceptMapping.concept)) assembly.reportError('concept', `Unknown ontology concept ${conceptMapping.concept}.`, mappingPath);
    for (const [kind, mappingKey] of [
      ['object', 'object_mappings'],
      ['link', 'link_mappings'],
    ] as const)
      (conceptMapping[mappingKey] ?? []).forEach((node: any, j: number) =>
        queue.push({
          node,
          path: [...mappingPath, mappingKey, j],
          concept: conceptMapping.concept,
          rootConcept: conceptMapping.concept,
          relationships: [],
          kind,
          depth: 0,
          inLink: kind === 'link',
        }),
      );
  });
}
/** A link node adds its relationship, then queues its object mapping and nested links. */
function expandLinkTask(walk: MappingWalk, task: MappingTask) {
  const { node, path, rootConcept } = task;
  let { relationships } = task;
  if (node.relationship) {
    inheritedRelationship(walk.catalog.concepts, rootConcept, node.relationship);
    relationships = [...relationships, node.relationship];
  }
  walk.queue.push({
    ...task,
    node: node.object_mapping,
    path: [...path, 'object_mapping'],
    relationships,
    kind: 'object',
    depth: task.depth + 1,
  });
  for (const [j, child] of (node.children ?? []).entries())
    walk.queue.push({
      ...task,
      node: child,
      path: [...path, 'children', j],
      relationships,
      kind: 'link',
      depth: task.depth + 1,
    });
}
function bindingKindOf(task: MappingTask): BindingKind {
  if (task.inLink) return 'link';
  if (task.kind === 'referent') return 'referent';
  return 'object';
}
/** An object or referent node may bind an expression, then queues its nested referents. */
function expandObjectTask(walk: MappingWalk, task: MappingTask) {
  const { node, path, rootConcept } = task;
  const { concepts } = walk.catalog;
  let { concept, relationships } = task;
  if (task.kind === 'referent') {
    const relation = inheritedRelationship(concepts, concept, node.relationship);
    if ((relation.roles ?? []).length !== 1) throw new BadRequestError(`Referent ${concept}.${node.relationship} needs exactly one target role for nested resolution.`);
    concept = relation.roles[0].concept;
    relationships = [...relationships, node.relationship];
  }
  concept = node.concept ?? concept;
  if (!concepts.has(concept)) throw new BadRequestError(`Unknown ontology concept ${concept}.`);
  if (node.expression !== undefined) {
    const refs = resolveExpressionRefs(walk.context, walk.catalog, node.expression);
    walk.context.bindings.push({
      id: JSON.stringify(path),
      kind: bindingKindOf(task),
      concept,
      rootConcept,
      relationships,
      expression: node.expression,
      ...refs,
      evidence: evidence(walk.assembly.entry.doc, [...path, 'expression']),
    });
  }
  for (const [j, child] of (node.referent_mappings ?? []).entries())
    walk.queue.push({
      ...task,
      node: child,
      path: [...path, 'referent_mappings', j],
      concept,
      relationships,
      kind: 'referent',
      depth: task.depth + 1,
    });
}
/** Reads every concept mapping into bindings. A node that cannot be read becomes a finding and does not stop the rest. */
function readBindings(assembly: Assembly, context: RuntimeContext, catalog: Catalog) {
  const walk: MappingWalk = { assembly, context, catalog, queue: [] };
  seedMappingTasks(walk);
  for (let i = 0; i < walk.queue.length; i++) {
    const task = walk.queue[i];
    if (task.depth > 128) {
      assembly.reportError('mapping-depth', 'Mapping nesting exceeds 128.', task.path);
      continue;
    }
    try {
      if (task.kind === 'link') expandLinkTask(walk, task);
      else expandObjectTask(walk, task);
    } catch (error) {
      assembly.reportError('mapping-reference', (error as Error).message, task.path);
    }
  }
}
/** Resolves the metric-to-concept bindings declared in the workbench extension of the mapping or embedded model. */
function readMetricBindings(assembly: Assembly, context: RuntimeContext, catalog: Catalog, ontology: any) {
  const { entry } = assembly;
  // Bindings can belong to a standalone mapping or an embedded semantic model.
  const kpiOwner = entry.ontology ? entry.data.semantic_model : entry.data;
  const kpiPath = entry.ontology ? [...entry.path, 'semantic_model'] : entry.path;
  const kpi = readKpiBindings(kpiOwner, '', !entry.ontology);
  const workbench = workbenchEntry(kpiOwner);
  const extIndex = workbench?.index ?? 0;
  const extList = workbench?.form.list ?? 'custom_extensions';
  context.metricBindings = resolveBindings(kpi.value, ontology, new Set(catalog.metrics.keys())).map((resolvedBinding, i) => {
    const bindingEvidence = evidence(entry.doc, [...kpiPath, extList, extIndex, 'data', 'kpi_bindings', i]);
    return {
      metric: resolvedBinding.metric,
      measures: resolvedBinding.measures,
      ...(resolvedBinding.of ? { of: resolvedBinding.of } : {}),
      findings: resolvedBinding.problems.map(message => ({
        severity: 'warning' as const,
        code: 'metric-binding',
        message,
        evidence: bindingEvidence,
      })),
      evidence: bindingEvidence,
    };
  });
}
export function assemble(parsed: Parsed[], entry: Entry): RuntimeContext {
  const assembly = startAssembly(parsed, entry);
  const resolved = resolveTargets(assembly);
  const context = emptyContext(assembly, resolved);
  const { ontologyTarget, semanticTarget } = resolved;
  if (!ontologyTarget || !semanticTarget) return context;
  const catalog: Catalog = {
    concepts: new Map<string, any>(context.concepts.map(c => [c.concept, c])),
    fields: new Map(),
    metrics: new Map(),
  };
  collectFields(context, catalog, { ontologyTarget, semanticTarget });
  collectMetrics(context, catalog, semanticTarget);
  resolveMetricDependencies(assembly, context, catalog);
  readBindings(assembly, context, catalog);
  readMetricBindings(assembly, context, catalog, ontologyTarget.data ?? {});
  return context;
}
