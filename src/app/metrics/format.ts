/** Shares readable metric labels, formulas and targets between tables, details and graph badges. */
import type { ConceptLink, KpiExplanation, KpiSummary } from '../../server/agent/explain';
import { expressionRefs } from '../../shared/metrics/deps';
// Wording shared by the Metrics view, the metric detail and the graph badges.
export const typeLabel: Record<KpiSummary['type'], string> = {
  simple: 'Simple',
  ratio: 'Ratio',
  derived: 'Derived',
  cumulative: 'Cumulative',
  filtered: 'Filtered',
};
export const additivityLabel = {
  additive: 'Additive',
  semi_additive: 'Semi-additive',
  non_additive: 'Non-additive',
} as const;
/** The headline of the division-by-zero rule in a KPI explanation. */
export const divisionByZeroTitle: Record<KpiExplanation['divisionByZero'], string> = {
  handled: 'Division by zero guarded',
  unhandled: 'Division by zero not guarded',
  'n/a': 'No division',
};
/** Formats metric concept links for compact display. */
export const conceptText = (links: ConceptLink[]) => {
  const conceptLink = links.find(c => c.role === 'measures');
  const of = links.find(c => c.role === 'of');
  return [conceptLink ? (conceptLink.concept ?? conceptLink.input) : null, of ? `of ${of.concept ?? of.input}` : null].filter(Boolean).join(' ');
};
/** Converts an identifier into readable words. */
export const humanize = (name: string) => name.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
// A metric expression as readable parts: governed metrics become their labels, NULLIF guards and
// operators are shown as arithmetic. Anything else stays as written.
/** Represents a metric reference, arithmetic operator or unchanged formula text. */
export type FormulaPart = { kind: 'metric' | 'op' | 'text'; text: string; name?: string };
/** Replaces metric names with labels and renders recognized arithmetic in readable parts. */
export function readableFormula(sql: string, labels: Map<string, string>): FormulaPart[] {
  const refs = expressionRefs(sql).filter(r => r.table === null && labels.has(r.column));
  if (!refs.length) return [];
  const compact = sql
    .replace(/NULLIF\s*\(\s*([A-Za-z_][\w$]*)\s*,\s*0(?:\.0+)?\s*\)/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  const parts: FormulaPart[] = [];
  for (const token of compact.split(/([A-Za-z_][\w$]*|[-+*/()])/).filter(t => t.trim())) {
    const trimmed = token.trim();
    if (labels.has(trimmed)) parts.push({ kind: 'metric', text: labels.get(trimmed)!, name: trimmed });
    else if (['+', '-', '*', '/', '(', ')'].includes(trimmed))
      parts.push({
        kind: 'op',
        text: ({ '*': '×', '/': '÷', '-': '−' } as Record<string, string>)[trimmed] ?? trimmed,
      });
    else parts.push({ kind: 'text', text: trimmed });
  }
  return parts;
}
/** Formats a metric target with its optional unit. */
export function targetText(target: any, unit?: string) {
  const show = (v: number) => (unit === 'ratio' ? `${Math.round(v * 1000) / 10}%` : `${v.toLocaleString()}${unit ? ' ' + unit : ''}`);
  let direction: string;
  if (target.direction === 'higher_is_better') {
    direction = 'at least';
  } else if (target.direction === 'lower_is_better') {
    direction = 'at most';
  } else {
    direction = 'between';
  }
  let value: string;
  if (Array.isArray(target.range)) {
    value = `${show(target.range[0])} and ${show(target.range[1])}`;
  } else if (typeof target.value === 'number') {
    value = show(target.value);
  } else {
    value = '';
  }
  const grainText = target.grain ? ` per ${target.grain}` : '';
  const periodText = target.period ? ` (${target.period})` : '';
  return `${direction} ${value}${grainText}${periodText}`.trim();
}
