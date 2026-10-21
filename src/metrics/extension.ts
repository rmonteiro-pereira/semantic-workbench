import Ajv2020 from 'ajv/dist/2020';
import metricSchema from '../../schemas/semantic-workbench-metric-v1.json';
import mappingSchema from '../../schemas/semantic-workbench-mapping-v1.json';
import type { Issue } from '../diagnostics';
import { ansiExpression, expressionRefs, metricDependencies } from './deps';
// metric attributes in Ossie `custom_extensions` (research R1, R12): an entry with
// vendor_name SEMANTIC_WORKBENCH whose `data` is a JSON string. Validated against the pinned
// application schemas by the same code in the browser, the file store and the API (FR-003).
export const VENDOR = 'SEMANTIC_WORKBENCH',
  METRIC_SCHEMA = 'semantic-workbench/metric/v1',
  MAPPING_SCHEMA = 'semantic-workbench/mapping/v1';
const ajv = new Ajv2020({ strict: false, allErrors: true });
const checkMetric = ajv.compile(metricSchema),
  checkMapping = ajv.compile(mappingSchema);
export const GRAINS = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type Grain = (typeof GRAINS)[number];
export type KpiType = 'simple' | 'ratio' | 'derived' | 'cumulative' | 'filtered';
export type Additivity = 'additive' | 'semi_additive' | 'non_additive';
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
export type KpiBinding = { metric: string; measures: string; of?: string };
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
// The workbench's entry in a custom_extensions list, with its index (for issue paths).
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
  } catch (e) {
    return {
      issues: [
        {
          severity: 'error',
          code: 'extension',
          path,
          message: `The SEMANTIC_WORKBENCH extension data is not valid JSON: ${(e as Error).message}`,
        },
      ],
    };
  }
}
const pointer = (segments: (string | number)[]) =>
  segments.map(s => '/' + String(s).replace(/~/g, '~0').replace(/\//g, '~1')).join('');
// Rules stated in plain language; the schema's if/then branches would otherwise report bare `required`.
function metricRules(v: any): { inner: string; message: string }[] {
  const out: { inner: string; message: string }[] = [];
  if (!object(v)) return out;
  if (v.type === 'ratio' && (v.numerator === undefined || v.denominator === undefined))
    out.push({ inner: '/type', message: 'A ratio metric requires numerator and denominator.' });
  if (
    v.additivity === 'semi_additive' &&
    (v.non_additive_over === undefined || v.period_aggregation === undefined)
  )
    out.push({
      inner: '/additivity',
      message: 'A semi_additive metric requires non_additive_over and period_aggregation.',
    });
  if (
    v.status === 'deprecated' &&
    v.replaced_by === undefined &&
    v.deprecation_reason === undefined
  )
    out.push({
      inner: '/status',
      message: 'A deprecated metric requires replaced_by or deprecation_reason.',
    });
  if (v.type === 'ratio' && v.additivity !== undefined && v.additivity !== 'non_additive')
    out.push({
      inner: '/additivity',
      message: 'A ratio metric is non_additive: summing ratios gives a wrong result.',
    });
  return out;
}
function schemaIssues(
  validate: ReturnType<typeof ajv.compile>,
  value: unknown,
  path: string,
  rules: { inner: string; message: string }[],
): Issue[] {
  const issues: Issue[] = rules.map(r => ({
    severity: 'error',
    code: 'extension',
    path,
    innerPath: r.inner,
    message: r.message,
  }));
  if (!validate(value))
    for (const e of validate.errors ?? []) {
      if (e.keyword === 'if' || (e.schemaPath.includes('/allOf/') && rules.length)) continue;
      const inner =
        (e.instancePath || '') +
        (e.keyword === 'required'
          ? '/' + e.params.missingProperty
          : e.keyword === 'additionalProperties'
            ? '/' + e.params.additionalProperty
            : '');
      issues.push({
        severity: 'error',
        code: 'extension',
        path,
        innerPath: inner || '/',
        message: `${inner || 'extension'}: ${e.message ?? 'schema violation'}`,
      });
    }
  return issues;
}
// Parse and validate a metric's extension. `path` is the JSON pointer of the metric.
export function readMetricExtension(
  metric: any,
  path = '',
): { value: MetricExtension | null; issues: Issue[] } {
  const entry = workbenchEntry(metric);
  if (!entry) return { value: null, issues: [] };
  const dataPath = `${path}/custom_extensions/${entry.index}/data`,
    parsed = parseData(entry.data, dataPath);
  if (parsed.issues.length) return { value: null, issues: parsed.issues };
  const issues = schemaIssues(checkMetric, parsed.value, dataPath, metricRules(parsed.value));
  return { value: issues.length ? null : parsed.value, issues };
}
// Parse and validate metric bindings in a mapping document root (or an embedded semantic model root).
export function readKpiBindings(
  owner: any,
  path = '',
  mappingDocument = true,
): { value: KpiBinding[]; issues: Issue[] } {
  const entry = workbenchEntry(owner);
  if (!entry) return { value: [], issues: [] };
  const dataPath = `${path}/custom_extensions/${entry.index}/data`,
    parsed = parseData(entry.data, dataPath);
  if (parsed.issues.length) return { value: [], issues: parsed.issues };
  // On a semantic model root the entry may hold model defaults instead of metric bindings.
  if (!mappingDocument && !(object(parsed.value) && parsed.value.schema === MAPPING_SCHEMA))
    return { value: [], issues: [] };
  const issues = schemaIssues(checkMapping, parsed.value, dataPath, []);
  const seen = new Set<string>();
  (Array.isArray(parsed.value?.kpi_bindings) ? parsed.value.kpi_bindings : []).forEach(
    (b: any, i: number) => {
      if (typeof b?.metric === 'string') {
        if (seen.has(b.metric))
          issues.push({
            severity: 'error',
            code: 'extension',
            path: dataPath,
            innerPath: `/kpi_bindings/${i}/metric`,
            message: `Metric "${b.metric}" is bound more than once; keep one binding per metric.`,
          });
        seen.add(b.metric);
      }
    },
  );
  return { value: issues.length ? [] : parsed.value.kpi_bindings, issues };
}
// Offset of an inner JSON key inside a block scalar's source range, for line/column reporting.
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
// Top-level shape of an expression: `a / b` or `a / NULLIF(b, 0)` over two metric names is a ratio.
export function ratioParts(
  sql: string,
  metricNames: Set<string>,
): { numerator: string; denominator: string; guarded: boolean } | null {
  const compact = sql.replace(/\s+/g, ' ').trim();
  const m = compact.match(
    /^\(?\s*"?([A-Za-z_][\w$]*)"?\s*\)?\s*\/\s*(?:NULLIF\s*\(\s*"?([A-Za-z_][\w$]*)"?\s*,\s*0(?:\.0+)?\s*\)|"?([A-Za-z_][\w$]*)"?)$/i,
  );
  if (!m) return null;
  const numerator = m[1],
    denominator = m[2] ?? m[3];
  return metricNames.has(numerator) && metricNames.has(denominator)
    ? { numerator, denominator, guarded: !!m[2] }
    : null;
}
// The metric type an expression shows, used when no type is declared and to check a declared one.
export function inferredType(
  sql: string | undefined,
  metricNames: Set<string>,
): { type: KpiType; numerator?: string; denominator?: string; inputs?: string[] } {
  if (!sql) return { type: 'simple' };
  const ratio = ratioParts(sql, metricNames);
  if (ratio) return { type: 'ratio', numerator: ratio.numerator, denominator: ratio.denominator };
  const inputs = metricDependencies(sql, metricNames);
  return inputs.length ? { type: 'derived', inputs } : { type: 'simple' };
}
// Additivity an expression implies when none is declared: SUM/COUNT of fields add up; ratios,
// distinct counts, averages, minima and maxima do not. Null when it cannot be told.
export function inferredAdditivity(
  sql: string | undefined,
  kind: KpiType,
  inputAdditivity: (name: string) => Additivity | null,
  inputs: string[] = [],
): Additivity | null {
  if (!sql) return null;
  if (kind === 'ratio') return 'non_additive';
  const upper = sql.toUpperCase();
  if (
    /COUNT\s*\(\s*DISTINCT/.test(upper) ||
    /\b(AVG|MIN|MAX|MEDIAN|PERCENTILE\w*)\s*\(/.test(upper)
  )
    return 'non_additive';
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
// Cross-references within one semantic model (FR-004): inputs exist, no cycles, grains and fields
// exist, and the declared type agrees with the expression.
export function metricLayerIssues(
  model: any,
  prefix: string,
  fieldNames: Map<string, Set<string>>,
): Issue[] {
  const issues: Issue[] = [],
    metrics: any[] = Array.isArray(model?.metrics) ? model.metrics.filter(object) : [];
  const names = new Set(metrics.map(m => m.name).filter((n: unknown) => typeof n === 'string'));
  const deps = new Map<string, string[]>();
  metrics.forEach((m: any, i: number) => {
    const path = `${prefix}/metrics/${i}`,
      sql = ansiExpression(m);
    deps.set(m.name, sql ? metricDependencies(sql, names) : []);
    const { value, issues: own } = readMetricExtension(m, path);
    issues.push(...own);
    if (!value) return;
    const dataPath = `${path}/custom_extensions/${workbenchEntry(m)!.index}/data`;
    const err = (inner: string, message: string, code = 'kpi-reference') =>
      issues.push({ severity: 'error', code, path: dataPath, innerPath: inner, message });
    for (const [key, ref] of [
      ['numerator', value.numerator],
      ['denominator', value.denominator],
      ['replaced_by', value.replaced_by],
    ] as const)
      if (ref !== undefined && !names.has(ref))
        err('/' + key, `${key} "${ref}" is not a metric of this semantic model.`);
    (value.inputs ?? []).forEach((ref, j) => {
      if (!names.has(ref))
        err(`/inputs/${j}`, `Input "${ref}" is not a metric of this semantic model.`);
    });
    const field = (ref: string, inner: string) => {
      const [d, f] = ref.split('.');
      if (!fieldNames.get(d)?.has(f))
        err(inner, `Field ${ref} does not exist in this semantic model.`);
    };
    if (value.time) {
      field(value.time.dimension, '/time/dimension');
      const min = value.time.min_grain;
      for (const [j, g] of (value.time.allowed_grains ?? []).entries())
        if (min && GRAIN_ORDER.get(g)! < GRAIN_ORDER.get(min)!)
          err(
            `/time/allowed_grains/${j}`,
            `Grain ${g} is finer than the minimum grain ${min}.`,
            'kpi-grain',
          );
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
    if (
      value.type === 'ratio' &&
      (shown.type !== 'ratio' ||
        shown.numerator !== value.numerator ||
        shown.denominator !== value.denominator)
    )
      warn(
        shown.type === 'ratio'
          ? `Declared ratio ${value.numerator} / ${value.denominator}, but the expression divides ${shown.numerator} by ${shown.denominator}.`
          : `Declared ratio ${value.numerator} / ${value.denominator}, but the expression is not a division of these metrics.`,
      );
    if (value.type === 'simple' && shown.type !== 'simple')
      warn(
        `Declared simple, but the expression uses other metrics (${(shown.inputs ?? [shown.numerator, shown.denominator]).join(', ')}).`,
      );
    if (
      (value.type === 'derived' || value.type === 'filtered' || value.type === 'cumulative') &&
      value.inputs
    ) {
      const used = new Set(metricDependencies(sql ?? '', names));
      const missing = value.inputs.filter(x => !used.has(x));
      if (missing.length)
        warn(`Declared inputs ${missing.join(', ')} do not appear in the expression.`);
    }
    if (value.type === 'derived' && shown.type === 'simple')
      warn('Declared derived, but the expression uses no other metric.');
  });
  // Dependency cycles among metrics (iterative depth-first search). A warning here: the planner
  // refuses cyclic metrics, and the file stays importable so the cycle can be repaired.
  const state = new Map<string, number>();
  for (const start of names) {
    if (state.get(start)) continue;
    const stack: [string, number][] = [[start, 0]];
    state.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1],
        next = (deps.get(top[0]) ?? [])[top[1]++];
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
          message: `Metric dependency cycle: ${[...stack.slice(stack.findIndex(s => s[0] === next)).map(s => s[0]), next].join(' → ')}.`,
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
export { expressionRefs };
