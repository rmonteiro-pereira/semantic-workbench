// Explains project metrics using semantic models, mappings, and data contracts. SQL previews use
// governed definitions and are never executed.
import { inspect } from '../../shared/core/model';
import { rdfSyntax } from '../../shared/validation/rdf';
import { semanticModelPaths } from '../../shared/edit/item-model';
import { isMapping } from '../../shared/mappings/mapping-schema';
import type { Issue } from '../../shared/validation/diagnostics';
import { ansiExpression, expressionRefs, metricDependencies } from '../../shared/metrics/deps';
import {
  GRAINS,
  inferredAdditivity,
  inferredType,
  metricLayerIssues,
  ratioParts,
  readKpiBindings,
  readMetricExtension,
  type Additivity,
  type Grain,
  type KpiType,
  type MetricExtension,
} from '../../shared/metrics/extension';
import { mappingExpressionBindings, resolveBindings, type ResolvedBinding } from '../../shared/metrics/bindings';
import { documentsOfProject } from '../../shared/core/project-scope';
import { modelContext, planQuery, type StoredDocument } from './runtime';
import { BadRequestError } from '../projects/errors';
type ProjectDocument = StoredDocument & { path: string };
type Parsed = { doc: ProjectDocument; data: any };
type ModelRef = {
  doc: ProjectDocument;
  path: (string | number)[];
  model: any;
  ontology?: any;
  embeddedMapping?: any;
};
/** Connects a metric input to a concept and records its source and binding problems. */
export type ConceptLink = {
  concept: string | null;
  input: string;
  role: 'measures' | 'of';
  source: ResolvedBinding['source'];
  file: string;
  problems: string[];
};
/** Summarizes a metric’s definition, governance attributes, bindings, and findings. */
export type KpiSummary = {
  file: string;
  modelPath: (string | number)[];
  model: string;
  layout: 'split' | 'embedded (deprecated)';
  name: string;
  label: string;
  description?: string;
  expression?: string;
  type: KpiType;
  typeDeclared: boolean;
  additivity: Additivity | null;
  additivityDeclared: boolean;
  unit?: string;
  format?: string;
  status?: string;
  owner?: string;
  /** Server mode only: whether the owner names someone who has signed in. */
  ownerVerified?: boolean;
  steward?: string;
  inputs: string[];
  concepts: ConceptLink[];
  extension: MetricExtension | null;
  findings: Issue[];
  // True when a SEMANTIC_WORKBENCH extension supplies governance attributes.
  governed: boolean;
};
/** A metric or field in the dependency tree, with repeated references marked. */
export type TreeNode = {
  kind: 'metric' | 'field';
  name: string;
  label?: string;
  role?: 'numerator' | 'denominator' | 'input';
  type?: KpiType;
  additivity?: Additivity | null;
  expression?: string;
  dataset?: string;
  children: TreeNode[];
  repeated?: boolean;
};
/** Quality or service-level evidence supplied by a data contract. */
export type Trust = {
  kind: 'quality' | 'sla';
  name?: string;
  dimension?: string;
  severity?: string;
  description?: string;
  property?: string;
  value?: unknown;
  unit?: string;
  element?: string;
};
/** Links a physical input to its data contract object or property and quality evidence. */
export type OdcsLink = {
  file: string;
  contract: string;
  object: string;
  physicalName: string;
  property: string | null;
  logicalType?: string;
  quality: Trust[];
};
/** Describes a leaf metric’s datasets, physical columns, and contract evidence. */
export type BaseInput = {
  metric: string;
  label: string;
  expression: string;
  dialect: string;
  aggregation: string | null;
  datasets: { name: string; source: string }[];
  fields: {
    dataset: string;
    field: string;
    expression: string;
    columns: string[];
    odcs: OdcsLink[];
  }[];
  sla: Trust[];
};
/** An unexecuted SQL plan or the reason planning was refused. */
export type SqlPreview =
  | {
      grain: Grain | null;
      dimensions: string[];
      rollup: string | null;
      sql: string;
      joins: string[];
      warnings: string[];
      notExecuted: true;
    }
  | { refused: string; grain: Grain | null; dimensions: string[]; rollup: string | null };
/** Explains a metric’s formula, dependencies, aggregation rules, and SQL preview. */
export type KpiExplanation = {
  kpi: KpiSummary;
  formula: string;
  tree: TreeNode;
  inputs: BaseInput[];
  time: { dimension: string; minGrain?: Grain; allowedGrains: Grain[] } | null;
  dimensions: string[];
  filters: { field: string; operator: string; value?: unknown; text: string }[];
  additivityText: string;
  divisionByZero: 'handled' | 'unhandled' | 'n/a';
  divisionText: string;
  missingValues: string;
  concepts: ConceptLink[];
  targets: any[];
  sqlPreview: SqlPreview;
  policy: string;
};
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
function parseProject(documents: StoredDocument[], slug: string): Parsed[] {
  return (documents as ProjectDocument[])
    .filter(d => d.project === slug)
    .flatMap(doc => {
      try {
        if (rdfSyntax(doc.source, doc.filename)) return [];
        const inspected = inspect(doc.source, doc.filename);
        return 'document' in inspected && object(inspected.document) ? [{ doc, data: inspected.document }] : [];
      } catch {
        return [];
      }
    });
}
// Models may be standalone, wrapped in a legacy list, or embedded in an ontology mapping.
function semanticModels(parsed: Parsed[]): ModelRef[] {
  return parsed.flatMap(({ doc, data }): ModelRef[] =>
    semanticModelPaths(data).map(path => {
      const model = path.reduce((value: any, key) => value[key], data);
      if (path[0] !== 'ontology_mappings') return { doc, path, model };
      const embeddedMapping = data.ontology_mappings[path[1]];
      return { doc, path, model, ontology: data, embeddedMapping };
    }),
  );
}
const pointerOf = (path: (string | number)[]) => path.map(p => '/' + p).join('');
const fieldNamesOf = (model: any) =>
  new Map<string, Set<string>>(
    list(model.datasets)
      .filter(object)
      .map((d: any) => [d.name, new Set(list(d.fields).map((f: any) => f?.name))]),
  );
// Standard mappings also provide evidence when the extension does not bind a metric.
function conceptLinks(parsed: Parsed[], ref: ModelRef, names: Set<string>): Map<string, ConceptLink[]> {
  const out = new Map<string, ConceptLink[]>();
  const add = (bindings: ResolvedBinding[], file: string) => {
    for (const binding of bindings) {
      const links = out.get(binding.metric) ?? [];
      if (binding.source === 'mapping-expression' && links.some(l => l.source === 'kpi-binding')) continue;
      links.push({
        ...binding.measures,
        role: 'measures',
        source: binding.source,
        file,
        problems: binding.problems,
      });
      if (binding.of)
        links.push({
          ...binding.of,
          role: 'of',
          source: binding.source,
          file,
          problems: binding.problems,
        });
      out.set(binding.metric, links);
    }
  };
  const sources: {
    owner: any;
    mapping: any;
    ontology: any;
    file: string;
    mappingDocument: boolean;
  }[] = [];
  if (ref.embeddedMapping)
    sources.push({
      owner: ref.model,
      mapping: ref.embeddedMapping,
      ontology: ref.ontology,
      file: ref.doc.path,
      mappingDocument: false,
    });
  else
    for (const parsedDocument of parsed)
      if (isMapping(parsedDocument.data) && parsedDocument.data.semantic_model_ref?.name === ref.model.name) {
        const ontology = parsed.find(o => Array.isArray(o.data.ontology) && o.data.name === parsedDocument.data.ontology_ref?.name)?.data;
        sources.push({
          owner: parsedDocument.data,
          mapping: parsedDocument.data,
          ontology,
          file: parsedDocument.doc.path,
          mappingDocument: true,
        });
      }
  for (const source of sources) {
    add(resolveBindings(readKpiBindings(source.owner, '', source.mappingDocument).value, source.ontology, names), source.file);
  }
  for (const source of sources) add(mappingExpressionBindings(source.mapping, names), source.file);
  return out;
}
function summaries(parsed: Parsed[], ref: ModelRef): KpiSummary[] {
  const metrics = list(ref.model.metrics).filter(object);
  const names = new Set<string>(metrics.map((m: any) => m.name).filter((n: unknown) => typeof n === 'string'));
  const prefix = pointerOf(ref.path);
  const issues = metricLayerIssues(ref.model, prefix, fieldNamesOf(ref.model));
  const links = conceptLinks(parsed, ref, names);
  const declared = new Map<string, MetricExtension | null>(metrics.map((m: any) => [m.name, readMetricExtension(m).value]));
  const additivity = (name: string, seen = new Set<string>()): Additivity | null => {
    const ext = declared.get(name);
    if (ext?.additivity) return ext.additivity;
    if (seen.has(name)) return null;
    seen.add(name);
    const metric = metrics.find((x: any) => x.name === name);
    const sql = ansiExpression(metric);
    const shape = inferredType(sql, names);
    return inferredAdditivity(sql, ext?.type ?? shape.type, n => additivity(n, seen), shape.inputs ?? ([shape.numerator, shape.denominator].filter(Boolean) as string[]));
  };
  const layout = ref.embeddedMapping ? 'embedded (deprecated)' : 'split';
  return metrics.map((metric: any, i: number) => {
    const ext = declared.get(metric.name) ?? null;
    const sql = ansiExpression(metric);
    const shape = inferredType(sql, names);
    const own = issues.filter(x => x.path === `${prefix}/metrics/${i}` || x.path.startsWith(`${prefix}/metrics/${i}/`));
    return {
      file: ref.doc.path,
      modelPath: ref.path,
      model: ref.model.name ?? '(unnamed)',
      layout,
      name: metric.name,
      label: ext?.label ?? metric.name,
      description: metric.description,
      expression: sql,
      type: ext?.type ?? shape.type,
      typeDeclared: !!ext,
      additivity: additivity(metric.name),
      additivityDeclared: !!ext?.additivity,
      unit: ext?.unit,
      format: ext?.format,
      status: ext?.status,
      owner: ext?.owner,
      steward: ext?.steward,
      inputs: sql ? metricDependencies(sql, names) : [],
      concepts: links.get(metric.name) ?? [],
      extension: ext,
      findings: own,
      governed: !!ext,
    };
  });
}
/** Lists metrics from all supported semantic models in the specified project. */
export function projectMetrics(documents: StoredDocument[], slug: string): KpiSummary[] {
  const parsed = parseProject(documents, slug);
  return semanticModels(parsed).flatMap(ref => summaries(parsed, ref));
}
const aggregationOf = (sql: string) => sql.match(/^\s*([A-Za-z_]+)\s*\(/)?.[1].toUpperCase() ?? null;
const additivityText: Record<Additivity | 'unknown', string> = {
  additive: 'Values can be summed across every dimension and across time.',
  semi_additive: 'Values can be summed across dimensions but not across time. Over several periods, take the period value named by the period aggregation.',
  non_additive: 'Never sum this value. At a coarser grain it is recomputed from its inputs.',
  unknown: 'Additivity is not declared and cannot be inferred from the expression, so no rollup is offered.',
};
// Division safety by inspection of the expression text: each `/` must divide by NULLIF(…, 0).
function divisionSafety(sql: string): 'handled' | 'unhandled' | 'n/a' {
  const bare = sql.replace(/'(?:[^']|'')*'/g, "''").replace(/--[^\n]*/g, '');
  const slashes = [...bare.matchAll(/\//g)];
  if (!slashes.length) return 'n/a';
  return slashes.every(s => /^\s*\(?\s*NULLIF\s*\(/i.test(bare.slice(s.index! + 1))) ? 'handled' : 'unhandled';
}
const operatorText: Record<string, string> = {
  equals: 'is',
  not_equals: 'is not',
  in: 'is one of',
  not_in: 'is not one of',
  gt: 'is greater than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  between: 'is between',
  is_null: 'is empty',
  is_not_null: 'is not empty',
};
function odcsIndex(parsed: Parsed[]) {
  const objects = new Map<string, { file: string; contract: any; object: any }[]>();
  for (const parsedDocument of parsed)
    if (parsedDocument.data.kind === 'DataContract')
      for (const schemaObject of list(parsedDocument.data.schema).filter(object)) {
        const key = schemaObject.physicalName ?? schemaObject.name;
        if (typeof key !== 'string') continue;
        const xs = objects.get(key) ?? [];
        xs.push({ file: parsedDocument.doc.path, contract: parsedDocument.data, object: schemaObject });
        objects.set(key, xs);
      }
  return objects;
}
const qualityOf = (owner: any): Trust[] =>
  list(owner?.quality)
    .filter(object)
    .map((rule: any) => ({
      kind: 'quality',
      name: rule.name,
      dimension: rule.dimension,
      severity: rule.severity,
      description: rule.description ?? (rule.metric ? `${rule.metric}${rule.mustBe !== undefined ? ` must be ${rule.mustBe}` : ''}` : undefined),
    }));
/** Explains a project metric and previews SQL for the requested grain and dimensions. */
export function explainMetric(
  documents: StoredDocument[],
  slug: string,
  path: string,
  metric: string,
  options: { grain?: string | null; dimensions?: string[]; rollup?: string | null } = {},
): KpiExplanation {
  const projectDocuments = documentsOfProject(documents, slug);
  const parsed = parseProject(projectDocuments, slug);
  const refs = semanticModels(parsed).filter(r => r.doc.path === path);
  if (!refs.length) throw new BadRequestError(`${path} has no semantic model in project ${slug}.`);
  const ref = refs.find(r => list(r.model.metrics).some((m: any) => m?.name === metric));
  if (!ref) throw new BadRequestError(`Metric ${metric} is not in ${path}.`);
  const all = summaries(parsed, ref);
  const byName = new Map(all.map(k => [k.name, k]));
  const kpi = byName.get(metric)!;
  const datasets = new Map<string, any>(
    list(ref.model.datasets)
      .filter(object)
      .map((d: any) => [d.name, d]),
  );
  const index = odcsIndex(parsed);
  const fieldLeaves = (sql: string) => {
    const seen = new Set<string>();
    return expressionRefs(sql).flatMap(exprRef => {
      const dataset = exprRef.table ?? (datasets.size === 1 ? [...datasets.keys()][0] : null);
      const key = `${dataset}.${exprRef.column}`;
      if (!dataset || seen.has(key) || (byName.has(exprRef.column) && !exprRef.table)) return [];
      seen.add(key);
      const fieldDefinition = list(datasets.get(dataset)?.fields).find((x: any) => x?.name === exprRef.column);
      return [
        {
          kind: 'field' as const,
          name: exprRef.column,
          dataset,
          expression: fieldDefinition ? ansiExpression(fieldDefinition) : undefined,
          children: [],
        },
      ];
    });
  };
  const tree = (name: string, role?: TreeNode['role'], path = new Set<string>()): TreeNode => {
    const kpiSummary = byName.get(name)!;
    if (path.has(name)) return { kind: 'metric', name, label: kpiSummary.label, role, children: [], repeated: true };
    const next = new Set(path).add(name);
    const sql = kpiSummary.expression ?? '';
    let ratio: { numerator: string; denominator: string } | null;
    if (kpiSummary.type === 'ratio') {
      if (kpiSummary.extension?.numerator && kpiSummary.extension.denominator) {
        ratio = {
          numerator: kpiSummary.extension.numerator,
          denominator: kpiSummary.extension.denominator,
        };
      } else {
        ratio = ratioParts(sql, new Set(byName.keys()));
      }
    } else {
      ratio = null;
    }
    let children: TreeNode[];
    if (ratio && byName.has(ratio.numerator) && byName.has(ratio.denominator)) {
      children = [tree(ratio.numerator, 'numerator', next), tree(ratio.denominator, 'denominator', next)];
    } else if (kpiSummary.inputs.length) {
      children = kpiSummary.inputs.map(n => tree(n, 'input', next));
    } else {
      children = fieldLeaves(sql);
    }
    return {
      kind: 'metric',
      name,
      label: kpiSummary.label,
      role,
      type: kpiSummary.type,
      additivity: kpiSummary.additivity,
      expression: sql,
      children,
    };
  };
  const root = tree(metric);
  const bases: string[] = [];
  const walk = (treeNode: TreeNode) => {
    if (treeNode.kind === 'metric' && !treeNode.repeated && !treeNode.children.some(c => c.kind === 'metric')) {
      if (!bases.includes(treeNode.name)) bases.push(treeNode.name);
    } else treeNode.children.forEach(walk);
  };
  walk(root);
  const inputs: BaseInput[] = bases.map(name => {
    const kpiSummary = byName.get(name)!;
    const sql = kpiSummary.expression ?? '';
    const leaves = fieldLeaves(sql);
    const used = [...new Set(leaves.map(l => l.dataset!))];
    const fields = leaves.map(leaf => {
      const datasetDefinition = datasets.get(leaf.dataset!);
      const columns = leaf.expression ? [...new Set(expressionRefs(leaf.expression).map(r => r.column))] : [leaf.name];
      const odcs: OdcsLink[] = (typeof datasetDefinition?.source === 'string' ? (index.get(datasetDefinition.source) ?? []) : []).flatMap((schemaEntry): OdcsLink[] => {
        const props = list(schemaEntry.object.properties).filter((p: any) => columns.includes(p?.physicalName ?? p?.name));
        const base = {
          file: schemaEntry.file,
          contract: schemaEntry.contract.name ?? schemaEntry.contract.id,
          object: schemaEntry.object.name,
          physicalName: schemaEntry.object.physicalName ?? schemaEntry.object.name,
        };
        return props.length
          ? props.map((prop: any) => ({
              ...base,
              property: prop.name,
              logicalType: prop.logicalType,
              quality: [...qualityOf(schemaEntry.object), ...qualityOf(prop)],
            }))
          : [{ ...base, property: null, quality: qualityOf(schemaEntry.object) }];
      });
      return {
        dataset: leaf.dataset!,
        field: leaf.name,
        expression: leaf.expression ?? leaf.name,
        columns,
        odcs,
      };
    });
    const sla = used.flatMap(name => {
      const datasetDefinition = datasets.get(name);
      return (index.get(datasetDefinition?.source) ?? []).flatMap(schemaEntry =>
        list(schemaEntry.contract.slaProperties)
          .filter((s: any) => object(s) && (!s.element || String(s.element).startsWith(schemaEntry.object.physicalName ?? schemaEntry.object.name)))
          .map((slaProperty: any) => ({
            kind: 'sla' as const,
            property: slaProperty.property,
            value: slaProperty.value,
            unit: slaProperty.unit,
            element: slaProperty.element,
          })),
      );
    });
    return {
      metric: name,
      label: kpiSummary.label,
      expression: sql,
      dialect: 'ANSI_SQL',
      aggregation: aggregationOf(sql),
      datasets: used.map(n => ({ name: n, source: datasets.get(n)?.source ?? '' })),
      fields,
      sla: sla.filter((s, i) => sla.findIndex(t => JSON.stringify(t) === JSON.stringify(s)) === i),
    };
  });
  const ext = kpi.extension;
  const time = ext?.time
    ? {
        dimension: ext.time.dimension,
        minGrain: ext.time.min_grain,
        allowedGrains: (ext.time.allowed_grains ?? GRAINS.filter(g => !ext.time!.min_grain || GRAINS.indexOf(g) >= GRAINS.indexOf(ext.time!.min_grain))) as Grain[],
      }
    : null;
  const division = divisionSafety(kpi.expression ?? '');
  const stocks = bases.filter(n => byName.get(n)!.additivity === 'semi_additive');
  let divisionText: string;
  if (division === 'handled') {
    divisionText = 'Division by zero is guarded: NULLIF turns a zero denominator into NULL, so the metric is empty rather than an error or infinity.';
  } else if (division === 'unhandled') {
    divisionText = 'Division by zero is not guarded: a zero denominator makes the query fail or return infinity, depending on the engine. Wrap the denominator in NULLIF(…, 0).';
  } else {
    divisionText = 'The expression divides by nothing.';
  }
  return {
    kpi,
    formula: kpi.expression ?? '',
    tree: root,
    inputs,
    time,
    dimensions: ext?.dimensions ?? [],
    filters: (ext?.filters ?? []).map(f => {
      const valueText = f.value === undefined ? '' : ' ' + JSON.stringify(f.value);
      return { ...f, text: `${f.field} ${operatorText[f.operator] ?? f.operator}${valueText}` };
    }),
    additivityText:
      additivityText[kpi.additivity ?? 'unknown'] +
      (kpi.additivity && !kpi.additivityDeclared ? ' (inferred from the expression)' : '') +
      (kpi.additivity === 'semi_additive' && ext?.period_aggregation ? ` Period aggregation: ${ext.period_aggregation}.` : ''),
    divisionByZero: division,
    divisionText,
    missingValues:
      'SUM and COUNT skip NULL values; rows without a value do not count' +
      (division === 'handled' ? '. An empty result means the denominator was zero or missing.' : '.') +
      (stocks.length && stocks.length < bases.length ? ` ${stocks.join(', ')} ${stocks.length > 1 ? 'are' : 'is a'} point-in-time stock${stocks.length > 1 ? 's' : ''}.` : ''),
    concepts: kpi.concepts,
    targets: ext?.targets ?? [],
    sqlPreview: preview(projectDocuments, ref, kpi, byName, time, options),
    policy: 'Semantic Workbench explains metrics and previews SQL. It never executes queries.',
  };
}
function preview(
  documents: StoredDocument[],
  ref: ModelRef,
  kpi: KpiSummary,
  byName: Map<string, KpiSummary>,
  time: KpiExplanation['time'],
  options: { grain?: string | null; dimensions?: string[]; rollup?: string | null },
): SqlPreview {
  const dimensions = options.dimensions ?? [];
  const rollup = options.rollup ?? null;
  const requested = options.grain ?? null;
  const grain = (requested ?? time?.minGrain ?? null) as Grain | null;
  const refuse = (refused: string): SqlPreview => ({ refused, grain, dimensions, rollup });
  if (requested !== null && !(GRAINS as readonly string[]).includes(requested)) return refuse(`Grain "${requested}" is not one of ${GRAINS.join(', ')}.`);
  if (grain && !time) return refuse(`${kpi.label} declares no time dimension, so it has no time grain.`);
  if (grain && time && !time.allowedGrains.includes(grain)) {
    const grainsText = time.allowedGrains.join(', ');
    const plural = time.allowedGrains.length > 1 ? 's' : '';
    const finerThanMinimum = time.minGrain && GRAINS.indexOf(grain) < GRAINS.indexOf(time.minGrain) ? ` (finer than the minimum grain ${time.minGrain})` : '';
    return refuse(`${kpi.label} is defined at ${grainsText} grain${plural}; ${grain} is not allowed${finerThanMinimum}.`);
  }
  if (rollup !== null && rollup !== 'sum') return refuse(`Rollup "${rollup}" is not supported; the only rollup is sum.`);
  // Additivity determines which rollups preserve the meaning of a metric.
  if (rollup === 'sum' && kpi.additivity === null) return refuse(`${kpi.label} has no declared additivity and none can be inferred, so summing it is refused.`);
  if (rollup === 'sum' && kpi.additivity === 'non_additive')
    return refuse(
      kpi.type === 'ratio'
        ? `${kpi.label} is a ratio. Summing ratios gives a wrong result; the ratio is recomputed from ${kpi.extension?.numerator ?? 'its numerator'} and ${kpi.extension?.denominator ?? 'its denominator'} at the requested grain instead.`
        : `${kpi.label} is non-additive. Summing it gives a wrong result; it is recomputed from its inputs at the requested grain instead.`,
    );
  // A month-end stock summed over a coarser period counts the same stock once per period.
  const stocks = [
    kpi.name,
    ...(function inputsOf(name: string, seen = new Set<string>()): string[] {
      if (seen.has(name)) return [];
      seen.add(name);
      return (byName.get(name)?.inputs ?? []).flatMap(i => [i, ...inputsOf(i, seen)]);
    })(kpi.name),
  ].filter((n, i, a) => a.indexOf(n) === i && byName.get(n)?.additivity === 'semi_additive');
  const stockGrain = (n: string) => byName.get(n)!.extension?.time?.min_grain ?? time?.minGrain;
  const over = stocks.filter(n => grain && stockGrain(n) && GRAINS.indexOf(grain) > GRAINS.indexOf(stockGrain(n)!));
  if (over.length) {
    const stockLabels = over.map(n => byName.get(n)!.label).join(', ');
    const stockNoun = over.length > 1 ? 'are stocks' : 'is a stock';
    const pronoun = over.length > 1 ? 'them' : 'it';
    const stockUnit = stockGrain(over[0]);
    const periodAggregation = byName.get(over[0])!.extension?.period_aggregation ?? 'last';
    return refuse(
      `${stockLabels} ${stockNoun} measured per ${stockUnit}. Summing ${pronoun} over the ${stockUnit}s of a ${grain} counts the same quantity once per ${stockUnit}; take the ` +
        `${periodAggregation} ${stockUnit} of each ${grain} instead. Preview available at ${stockUnit} grain.`,
    );
  }
  if (rollup === 'sum' && kpi.additivity === 'semi_additive' && !grain) return refuse(`${kpi.label} is semi-additive: it can be summed across dimensions but not across time. Choose a time grain.`);
  try {
    const context = modelContext(documents, ref.doc.id, ref.path);
    const key = (ref: string) => {
      const [d, f] = ref.split('.');
      return JSON.stringify([d, f]);
    };
    const plan = planQuery(context, {
      mappingId: context.mappingId,
      scope: 'model',
      metrics: [kpi.name],
      dimensions: dimensions.map(key),
      ...(grain && time ? { timeGrain: { field: key(time.dimension), grain } } : {}),
    });
    return {
      grain,
      dimensions,
      rollup,
      sql: plan.sql,
      joins: plan.joins.map((j: any) => j.name),
      warnings: plan.warnings,
      notExecuted: true,
    };
  } catch (error) {
    return refuse((error as Error).message);
  }
}
