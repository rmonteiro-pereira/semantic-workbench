/** Reads and validates workbench metric attributes stored as JSON in Ossie custom extensions. */
import type { ValidateFunction } from 'ajv';
import { metric as checkMetric, mapping as checkMapping } from '../../generated/validators.js';
import { schemaErrorPath, type Issue } from '../validation/diagnostics';
import { ansiExpression, expressionRefs, metricDependencies } from './deps';
// Metric attributes in Ossie `custom_extensions`: an entry with vendor_name SEMANTIC_WORKBENCH
// whose `data` is a JSON string. Validated against the pinned application schemas by the same code
// in the browser, the file store and the API.
export const VENDOR = 'SEMANTIC_WORKBENCH';
export const METRIC_SCHEMA = 'semantic-workbench/metric/v1';
export const MAPPING_SCHEMA = 'semantic-workbench/mapping/v1';
export const GRAINS = ['day', 'week', 'month', 'quarter', 'year'] as const;
/** Names a supported time granularity for metric aggregation. */
export type Grain = (typeof GRAINS)[number];
/** Names the metric calculation categories supported by workbench extensions. */
export type KpiType = 'simple' | 'ratio' | 'derived' | 'cumulative' | 'filtered';
/** Describes which dimensions permit a metric to be summed. */
export type Additivity = 'additive' | 'semi_additive' | 'non_additive';
/** Defines validated workbench attributes for a metric. */
export type MetricExtension = {
  schema: string;
  label?: string;
  type: KpiType;
  numerator?: string;
  denominator?: string;
  inputs?: string[];
  window?: { kind: string; length?: number; grain?: Grain };
  additivity?: Additivity;
  non_additive_over?: 'time';
  period_aggregation?: 'last' | 'first' | 'average';
  time?: { dimension: string; min_grain?: Grain; allowed_grains?: Grain[] };
  dimensions?: string[];
  filters?: { field: string; operator: string; value?: unknown }[];
  unit?: string;
  format?: string;
  targets?: any[];
  owner?: string;
  steward?: string;
  status?: 'draft' | 'proposed' | 'approved' | 'deprecated';
  replaced_by?: string;
  deprecation_reason?: string;
};
/** Links a metric to the concept it measures and an optional subject concept. */
export type KpiBinding = { metric: string; measures: string; of?: string };
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Finds the workbench extension and its index for validation paths. */
export function workbenchEntry(owner: any): { index: number; data: unknown } | null {
  const list = owner?.custom_extensions;
  if (!Array.isArray(list)) return null;
  const index = list.findIndex((e: any) => e?.vendor_name === VENDOR);
  return index < 0 ? null : { index, data: list[index]?.data };
}
function parseData(data: unknown, path: string): { value?: any; issues: Issue[] } {
  if (typeof data !== 'string')
    return {
      issues: [
        {
          severity: 'error',
          code: 'extension',
          path,
          message: 'The SEMANTIC_WORKBENCH extension data must be a JSON string.',
        },
      ],
    };
  try {
    return { value: JSON.parse(data), issues: [] };
  } catch (error) {
    return {
      issues: [
        {
          severity: 'error',
          code: 'extension',
          path,
          message: `The SEMANTIC_WORKBENCH extension data is not valid JSON: ${(error as Error).message}`,
        },
      ],
    };
  }
}
// Rules stated in plain language; the schema's if/then branches would otherwise report bare
// `required`.
function metricRules(value: any): { inner: string; message: string }[] {
  const out: { inner: string; message: string }[] = [];
  if (!object(value)) return out;
  if (value.type === 'ratio' && (value.numerator === undefined || value.denominator === undefined)) out.push({ inner: '/type', message: 'A ratio metric requires numerator and denominator.' });
  if (value.additivity === 'semi_additive' && (value.non_additive_over === undefined || value.period_aggregation === undefined))
    out.push({
      inner: '/additivity',
      message: 'A semi_additive metric requires non_additive_over and period_aggregation.',
    });
  if (value.status === 'deprecated' && value.replaced_by === undefined && value.deprecation_reason === undefined)
    out.push({
      inner: '/status',
      message: 'A deprecated metric requires replaced_by or deprecation_reason.',
    });
  if (value.type === 'ratio' && value.additivity !== undefined && value.additivity !== 'non_additive')
    out.push({
      inner: '/additivity',
      message: 'A ratio metric is non_additive: summing ratios gives a wrong result.',
    });
  return out;
}
function schemaIssues(validate: ValidateFunction, value: unknown, path: string, rules: { inner: string; message: string }[]): Issue[] {
  const issues: Issue[] = rules.map(rule => ({
    severity: 'error',
    code: 'extension',
    path,
    innerPath: rule.inner,
    message: rule.message,
  }));
  if (!validate(value))
    for (const error of validate.errors ?? []) {
      if (error.keyword === 'if' || (error.schemaPath.includes('/allOf/') && rules.length)) continue;
      const inner = schemaErrorPath(error);
      issues.push({
        severity: 'error',
        code: 'extension',
        path,
        innerPath: inner || '/',
        message: `${inner || 'extension'}: ${error.message ?? 'schema violation'}`,
      });
    }
  return issues;
}

/** Parses and validates a metric extension using the metric's JSON pointer for findings. */
export function readMetricExtension(metric: any, path = ''): { value: MetricExtension | null; issues: Issue[] } {
  const entry = workbenchEntry(metric);
  if (!entry) return { value: null, issues: [] };
  const dataPath = `${path}/custom_extensions/${entry.index}/data`;
  const parsed = parseData(entry.data, dataPath);
  if (parsed.issues.length) return { value: null, issues: parsed.issues };
  const issues = schemaIssues(checkMetric, parsed.value, dataPath, metricRules(parsed.value));
  return { value: issues.length ? null : parsed.value, issues };
}

/** Parses and validates metric bindings from a mapping or embedded model root. */
export function readKpiBindings(owner: any, path = '', mappingDocument = true): { value: KpiBinding[]; issues: Issue[] } {
  const entry = workbenchEntry(owner);
  if (!entry) return { value: [], issues: [] };
  const dataPath = `${path}/custom_extensions/${entry.index}/data`;
  const parsed = parseData(entry.data, dataPath);
  if (parsed.issues.length) return { value: [], issues: parsed.issues };
  // On a semantic model root the entry may hold model defaults instead of metric bindings.
  if (!mappingDocument && !(object(parsed.value) && parsed.value.schema === MAPPING_SCHEMA)) return { value: [], issues: [] };
  const issues = schemaIssues(checkMapping, parsed.value, dataPath, []);
  const seen = new Set<string>();
  (Array.isArray(parsed.value?.kpi_bindings) ? parsed.value.kpi_bindings : []).forEach((binding: any, i: number) => {
    if (typeof binding?.metric === 'string') {
      if (seen.has(binding.metric))
        issues.push({
          severity: 'error',
          code: 'extension',
          path: dataPath,
          innerPath: `/kpi_bindings/${i}/metric`,
          message: `Metric "${binding.metric}" is bound more than once; keep one binding per metric.`,
        });
      seen.add(binding.metric);
    }
  });
  return { value: issues.length ? [] : parsed.value.kpi_bindings, issues };
}

/** Finds an inner JSON key's source offset within an extension block scalar. */
export function locateInner(source: string, start: number, end: number, innerPath: string) {
  const keys = innerPath
    .split('/')
    .slice(1)
    .map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .filter(s => !/^\d+$/.test(s));
  const text = source.slice(start, end);
  for (const key of keys.reverse()) {
    const at = text.indexOf(JSON.stringify(key));
    if (at >= 0) return start + at;
  }
  return start;
}
// Top-level shape of an expression: `a / b` or `a / NULLIF(b, 0)` over two metric names is a
// ratio.
/** Recognizes a ratio between metric names, including a NULLIF zero guard. */
// `a / b` or `a / NULLIF(b, 0)`, each name optionally quoted and the numerator in parentheses.
const NAME = String.raw`"?([A-Za-z_][\w$]*)"?`;
const NUMERATOR = String.raw`^\(?\s*${NAME}\s*\)?`;
const GUARDED_DENOMINATOR = String.raw`NULLIF\s*\(\s*${NAME}\s*,\s*0(?:\.0+)?\s*\)`;
const RATIO_PATTERN = new RegExp(String.raw`${NUMERATOR}\s*\/\s*(?:${GUARDED_DENOMINATOR}|${NAME})$`, 'i');

/** The metric names along the cycle that closes when the search reaches `next` again. */
function cycleNames(stack: [string, number][], next: string): string[] {
  const cycleStart = stack.findIndex(entry => entry[0] === next);
  return [...stack.slice(cycleStart).map(entry => entry[0]), next];
}

export function ratioParts(sql: string, metricNames: Set<string>): { numerator: string; denominator: string; guarded: boolean } | null {
  const compact = sql.replace(/\s+/g, ' ').trim();
  const match = compact.match(RATIO_PATTERN);
  if (!match) return null;
  const numerator = match[1];
  const denominator = match[2] ?? match[3];
  return metricNames.has(numerator) && metricNames.has(denominator) ? { numerator, denominator, guarded: !!match[2] } : null;
}

/** Infers a metric calculation type from its expression. */
export function inferredType(sql: string | undefined, metricNames: Set<string>): { type: KpiType; numerator?: string; denominator?: string; inputs?: string[] } {
  if (!sql) return { type: 'simple' };
  const ratio = ratioParts(sql, metricNames);
  if (ratio) return { type: 'ratio', numerator: ratio.numerator, denominator: ratio.denominator };
  const inputs = metricDependencies(sql, metricNames);
  return inputs.length ? { type: 'derived', inputs } : { type: 'simple' };
}
// Additivity an expression implies when none is declared: SUM/COUNT of fields add up; ratios,
// distinct counts, averages, minima and maxima do not. Null when it cannot be told.
/** Infers whether an expression can be summed, or returns null when unknown. */
export function inferredAdditivity(sql: string | undefined, kind: KpiType, inputAdditivity: (name: string) => Additivity | null, inputs: string[] = []): Additivity | null {
  if (!sql) return null;
  if (kind === 'ratio') return 'non_additive';
  const upper = sql.toUpperCase();
  if (/COUNT\s*\(\s*DISTINCT/.test(upper) || /\b(AVG|MIN|MAX|MEDIAN|PERCENTILE\w*)\s*\(/.test(upper)) return 'non_additive';
  if (kind === 'derived') {
    if (/[*/]/.test(sql.replace(/'[^']*'/g, ''))) return 'non_additive';
    const all = inputs.map(inputAdditivity);
    if (all.every(a => a === 'additive')) return 'additive';
    if (all.some(a => a === 'non_additive')) return 'non_additive';
    return all.some(a => a === 'semi_additive') ? 'semi_additive' : null;
  }
  return /^\s*(SUM|COUNT)\s*\(/i.test(sql) ? 'additive' : null;
}
const GRAIN_ORDER = new Map(GRAINS.map((g, i) => [g, i]));
// Cross-references within one semantic model: inputs exist, no cycles, grains and fields exist,
// and the declared type agrees with the expression.
/** Checks metric dependencies, cycles, fields, grains and declared calculation types. */
export function metricLayerIssues(model: any, prefix: string, fieldNames: Map<string, Set<string>>): Issue[] {
  const issues: Issue[] = [];
  const metrics: any[] = Array.isArray(model?.metrics) ? model.metrics.filter(object) : [];
  const names = new Set(metrics.map(m => m.name).filter((n: unknown) => typeof n === 'string'));
  const deps = new Map<string, string[]>();
  metrics.forEach((metric: any, i: number) => {
    const path = `${prefix}/metrics/${i}`;
    const sql = ansiExpression(metric);
    deps.set(metric.name, sql ? metricDependencies(sql, names) : []);
    const { value, issues: own } = readMetricExtension(metric, path);
    issues.push(...own);
    if (!value) return;
    const dataPath = `${path}/custom_extensions/${workbenchEntry(metric)!.index}/data`;
    const err = (inner: string, message: string, code = 'kpi-reference') => issues.push({ severity: 'error', code, path: dataPath, innerPath: inner, message });
    for (const [key, ref] of [
      ['numerator', value.numerator],
      ['denominator', value.denominator],
      ['replaced_by', value.replaced_by],
    ] as const)
      if (ref !== undefined && !names.has(ref)) err('/' + key, `${key} "${ref}" is not a metric of this semantic model.`);
    (value.inputs ?? []).forEach((ref, j) => {
      if (!names.has(ref)) err(`/inputs/${j}`, `Input "${ref}" is not a metric of this semantic model.`);
    });
    const field = (ref: string, inner: string) => {
      const [dataset, fieldName] = ref.split('.');
      if (!fieldNames.get(dataset)?.has(fieldName)) err(inner, `Field ${ref} does not exist in this semantic model.`);
    };
    if (value.time) {
      field(value.time.dimension, '/time/dimension');
      const min = value.time.min_grain;
      for (const [j, grain] of (value.time.allowed_grains ?? []).entries())
        if (min && GRAIN_ORDER.get(grain)! < GRAIN_ORDER.get(min)!) err(`/time/allowed_grains/${j}`, `Grain ${grain} is finer than the minimum grain ${min}.`, 'kpi-grain');
    }
    (value.dimensions ?? []).forEach((d, j) => field(d, `/dimensions/${j}`));
    (value.filters ?? []).forEach((f, j) => field(f.field, `/filters/${j}/field`));
    // Declared type versus what the expression computes.
    const shown = inferredType(sql, names);
    const warn = (message: string) =>
      issues.push({
        severity: 'warning',
        code: 'kpi-type',
        path: dataPath,
        innerPath: '/type',
        message,
      });
    if (value.type === 'ratio' && (shown.type !== 'ratio' || shown.numerator !== value.numerator || shown.denominator !== value.denominator))
      warn(
        shown.type === 'ratio'
          ? `Declared ratio ${value.numerator} / ${value.denominator}, but the expression divides ${shown.numerator} by ${shown.denominator}.`
          : `Declared ratio ${value.numerator} / ${value.denominator}, but the expression is not a division of these metrics.`,
      );
    if (value.type === 'simple' && shown.type !== 'simple') warn(`Declared simple, but the expression uses other metrics (${(shown.inputs ?? [shown.numerator, shown.denominator]).join(', ')}).`);
    if ((value.type === 'derived' || value.type === 'filtered' || value.type === 'cumulative') && value.inputs) {
      const used = new Set(metricDependencies(sql ?? '', names));
      const missing = value.inputs.filter(x => !used.has(x));
      if (missing.length) warn(`Declared inputs ${missing.join(', ')} do not appear in the expression.`);
    }
    if (value.type === 'derived' && shown.type === 'simple') warn('Declared derived, but the expression uses no other metric.');
  });
  // Dependency cycles among metrics (iterative depth-first search). A warning here: the planner
  // refuses cyclic metrics, and the file stays importable so the cycle can be repaired.
  const state = new Map<string, number>();
  for (const start of names) {
    if (state.get(start)) continue;
    const stack: [string, number][] = [[start, 0]];
    state.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const next = (deps.get(top[0]) ?? [])[top[1]++];
      if (next === undefined) {
        state.set(top[0], 2);
        stack.pop();
        continue;
      }
      if (state.get(next) === 1) {
        issues.push({
          severity: 'warning',
          code: 'metric-cycle',
          path: `${prefix}/metrics`,
          message: `Metric dependency cycle: ${cycleNames(stack, next).join(' → ')}.`,
        });
        break;
      }
      if (!state.get(next)) {
        state.set(next, 1);
        stack.push([next, 0]);
      }
    }
  }
  return issues;
}
/** Exports the shared SQL reference reader for metric dependencies. */
export { expressionRefs };
