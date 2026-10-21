import type { ConceptLink, KpiSummary } from '../../server/agent/explain';
import { expressionRefs } from './deps';
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
export const conceptText = (links: ConceptLink[]) => {
  const m = links.find(c => c.role === 'measures'),
    of = links.find(c => c.role === 'of');
  return [m ? (m.concept ?? m.input) : null, of ? `of ${of.concept ?? of.input}` : null]
    .filter(Boolean)
    .join(' ');
};
export const humanize = (name: string) =>
  name.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
// A metric expression as readable parts: governed metrics become their labels, NULLIF guards and
// operators are shown as arithmetic. Anything else stays as written.
export type FormulaPart = { kind: 'metric' | 'op' | 'text'; text: string; name?: string };
export function readableFormula(sql: string, labels: Map<string, string>): FormulaPart[] {
  const refs = expressionRefs(sql).filter(r => r.table === null && labels.has(r.column));
  if (!refs.length) return [];
  const compact = sql
    .replace(/NULLIF\s*\(\s*([A-Za-z_][\w$]*)\s*,\s*0(?:\.0+)?\s*\)/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  const parts: FormulaPart[] = [];
  for (const token of compact.split(/([A-Za-z_][\w$]*|[-+*/()])/).filter(t => t.trim())) {
    const t = token.trim();
    if (labels.has(t)) parts.push({ kind: 'metric', text: labels.get(t)!, name: t });
    else if (['+', '-', '*', '/', '(', ')'].includes(t))
      parts.push({
        kind: 'op',
        text: ({ '*': '×', '/': '÷', '-': '−' } as Record<string, string>)[t] ?? t,
      });
    else parts.push({ kind: 'text', text: t });
  }
  return parts;
}
export function targetText(t: any, unit?: string) {
  const show = (v: number) =>
    unit === 'ratio'
      ? `${Math.round(v * 1000) / 10}%`
      : `${v.toLocaleString()}${unit ? ' ' + unit : ''}`;
  const direction =
    t.direction === 'higher_is_better'
      ? 'at least'
      : t.direction === 'lower_is_better'
        ? 'at most'
        : 'between';
  const value = Array.isArray(t.range)
    ? `${show(t.range[0])} and ${show(t.range[1])}`
    : typeof t.value === 'number'
      ? show(t.value)
      : '';
  return `${direction} ${value}${t.grain ? ` per ${t.grain}` : ''}${t.period ? ` (${t.period})` : ''}`.trim();
}
