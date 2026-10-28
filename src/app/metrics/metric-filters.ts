/** Filters, grouping and optional columns of the metrics list, as pure functions. */
import type { KpiSummary } from '../../server/agent/explain';
import { typeLabel } from './format';

/** Names the stable key used by selection and navigation. */
export const metricKey = (kpi: KpiSummary) => `${kpi.file}#${kpi.modelPath.join('/')}#${kpi.name}`;

export type GroupBy = 'none' | 'owner' | 'type' | 'status' | 'concept' | 'file';

export const groupLabel: Record<GroupBy, string> = {
  none: 'No grouping',
  owner: 'Owner',
  type: 'Type',
  status: 'Status',
  concept: 'Concept',
  file: 'File',
};

export type MetricFilters = {
  type: KpiSummary['type'] | '';
  status: string;
  owner: string;
  governedOnly: boolean;
  groupBy: GroupBy;
};

export const noFilters: MetricFilters = {
  type: '',
  status: '',
  owner: '',
  governedOnly: false,
  groupBy: 'none',
};

/** The columns that are worth showing: the ones with a value in at least one metric. */
export type MetricColumns = { unit: boolean; status: boolean; owner: boolean; concept: boolean };

/** Tells whether the filters or the search text hide any metric; grouping hides none. */
export function isNarrowed(filters: MetricFilters, term: string): boolean {
  const narrowing = [filters.type, filters.status, filters.owner, filters.governedOnly, term];
  return narrowing.some(Boolean);
}

/** Tells which optional columns have data in any metric, so empty columns are not drawn. */
export function visibleColumns(kpis: KpiSummary[]): MetricColumns {
  return {
    unit: kpis.some(kpi => kpi.unit),
    status: kpis.some(kpi => kpi.status),
    owner: kpis.some(kpi => kpi.owner),
    concept: kpis.some(kpi => kpi.concepts.length > 0),
  };
}

function matchesText(kpi: KpiSummary, term: string): boolean {
  const texts = [
    kpi.label,
    kpi.name,
    kpi.description,
    kpi.owner,
    ...kpi.concepts.map(concept => concept.concept ?? concept.input),
  ];
  return texts.some(text => typeof text === 'string' && text.toLocaleLowerCase().includes(term));
}

/** Keeps the metrics that match the dialog's filters and the search text. */
export function filterMetrics(kpis: KpiSummary[], filters: MetricFilters, term: string) {
  return kpis.filter(
    kpi =>
      (!filters.governedOnly || kpi.governed) &&
      (!filters.type || kpi.type === filters.type) &&
      (!filters.status || kpi.status === filters.status) &&
      (!filters.owner || kpi.owner === filters.owner) &&
      (!term || matchesText(kpi, term)),
  );
}

function conceptGroup(kpi: KpiSummary): string {
  const about = kpi.concepts.find(concept => concept.role === 'of')?.concept;
  const measured = kpi.concepts.find(concept => concept.role === 'measures')?.concept;
  return about ?? measured ?? 'Not bound to a concept';
}

function statusGroup(kpi: KpiSummary): string {
  if (!kpi.status) return 'No status';
  return kpi.status[0].toUpperCase() + kpi.status.slice(1);
}

/** Names the group a metric falls in for the chosen grouping. */
export function groupValue(kpi: KpiSummary, groupBy: GroupBy): string {
  if (groupBy === 'owner') return kpi.owner ?? 'No owner';
  if (groupBy === 'type') return typeLabel[kpi.type];
  if (groupBy === 'status') return statusGroup(kpi);
  if (groupBy === 'concept') return conceptGroup(kpi);
  if (groupBy === 'file') return kpi.file;
  return '';
}

/** Splits metrics into named groups, sorted by group name. */
export function groupMetrics(kpis: KpiSummary[], groupBy: GroupBy): [string, KpiSummary[]][] {
  const groups = new Map<string, KpiSummary[]>();
  for (const kpi of kpis) {
    const name = groupValue(kpi, groupBy);
    groups.set(name, [...(groups.get(name) ?? []), kpi]);
  }
  return [...groups.entries()].sort((first, second) => first[0].localeCompare(second[0]));
}
