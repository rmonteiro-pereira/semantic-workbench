/** Converts the metric wizard's draft into an expression and workbench extension attributes. */
import type { KpiType } from '../../shared/metrics/extension';
// The metric wizard's draft → the metric expression and the SEMANTIC_WORKBENCH extension it saves.
/** Holds the metric wizard's editable inputs before a save plan is built. */
export type Draft = {
  measures: string;
  of: string;
  file: string;
  name: string;
  label: string;
  description: string;
  type: KpiType;
  aggregation: string;
  field: string;
  numerator: string;
  denominator: string;
  inputs: string;
  expression: string;
  window: string;
  windowLength: string;
  windowGrain: string;
  filterField: string;
  filterOperator: string;
  filterValue: string;
  additivity: string;
  timeDimension: string;
  minGrain: string;
  grains: string[];
  dimensions: string[];
  direction: string;
  target: string;
  targetGrain: string;
  warning: string;
  critical: string;
  owner: string;
  steward: string;
  status: string;
  unit: string;
  format: string;
};
/** Builds the metric expression represented by the wizard draft. */
export function expressionFor(draft: Draft) {
  if (draft.type === 'simple') {
    if (!draft.field) return '';
    if (draft.aggregation === 'COUNT DISTINCT') return `COUNT(DISTINCT ${draft.field})`;
    return `${draft.aggregation}(${draft.field})`;
  }
  if (draft.type === 'ratio') return draft.numerator && draft.denominator ? `${draft.numerator} / NULLIF(${draft.denominator}, 0)` : '';
  return draft.expression.trim();
}
/** Splits comma-separated input into nonempty trimmed values. */
export const list = (text: string) =>
  text
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
// The extension names inputs and rules; the formula stays in the metric's expression.
/** Builds metric attributes while keeping the formula in the metric expression. */
/** The additivity a metric has by its type when the author did not choose one. */
function impliedAdditivity(draft: Draft): string {
  if (draft.type === 'ratio') return 'non_additive';
  if (draft.type === 'simple' && ['SUM', 'COUNT'].includes(draft.aggregation)) return 'additive';
  return '';
}

export function extensionFor(draft: Draft): Record<string, any> {
  const extension: Record<string, any> = { label: draft.label.trim() || undefined, type: draft.type };
  if (draft.type === 'ratio') {
    extension.numerator = draft.numerator;
    extension.denominator = draft.denominator;
  }
  if (['derived', 'cumulative', 'filtered'].includes(draft.type) && list(draft.inputs).length) extension.inputs = list(draft.inputs);
  if (draft.type === 'cumulative')
    extension.window = {
      kind: draft.window || 'to_date',
      ...(draft.window === 'rolling' && num(draft.windowLength) ? { length: num(draft.windowLength) } : {}),
      ...(draft.windowGrain ? { grain: draft.windowGrain } : {}),
    };
  if (draft.type === 'filtered' && draft.filterField)
    extension.filters = [
      {
        field: draft.filterField,
        operator: draft.filterOperator || 'equals',
        ...(['is_null', 'is_not_null'].includes(draft.filterOperator) ? {} : { value: draft.filterValue }),
      },
    ];
  const additivity = draft.additivity || impliedAdditivity(draft);
  if (additivity) extension.additivity = additivity;
  if (additivity === 'semi_additive') {
    extension.non_additive_over = 'time';
    extension.period_aggregation = 'last';
  }
  if (draft.timeDimension)
    extension.time = {
      dimension: draft.timeDimension,
      ...(draft.minGrain ? { min_grain: draft.minGrain } : {}),
      ...(draft.grains.length ? { allowed_grains: draft.grains } : {}),
    };
  if (draft.dimensions.length) extension.dimensions = draft.dimensions;
  if (draft.unit.trim()) extension.unit = draft.unit.trim();
  if (draft.format.trim()) extension.format = draft.format.trim();
  if (draft.direction && num(draft.target) !== undefined) {
    const ops = draft.direction === 'higher_is_better' ? 'mustBeLessThan' : 'mustBeGreaterThan';
    const thresholds: Record<string, any> = {};
    if (num(draft.warning) !== undefined) thresholds.warning = { [ops]: num(draft.warning) };
    if (num(draft.critical) !== undefined) thresholds.critical = { [ops]: num(draft.critical) };
    extension.targets = [
      {
        ...(draft.targetGrain ? { grain: draft.targetGrain } : {}),
        direction: draft.direction,
        value: num(draft.target),
        ...(Object.keys(thresholds).length ? { thresholds } : {}),
      },
    ];
  }
  if (draft.owner.trim()) extension.owner = draft.owner.trim();
  if (draft.steward.trim()) extension.steward = draft.steward.trim();
  extension.status = draft.status || 'proposed';
  return Object.fromEntries(Object.entries(extension).filter(([, v]) => v !== undefined));
}
