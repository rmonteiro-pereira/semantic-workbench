// Turns stored day files and the counts still in memory into the answer of the read operation:
// rekeyed to current addresses, filtered to what the reader may read, and totalled. Nothing here
// touches the disk or knows who the reader is beyond the two facts it is given about them.
import type { MigrationRecord } from '../../shared/core/address-migration';
import { parseAddress } from '../../shared/core/item-address';
import { BadRequestError } from '../projects/errors';
import { USAGE_MEASURE_LABELS, USAGE_MEASURES, type UsageMeasure } from './usage-counted-operations';
import { mergeItem, measureTotal, type CounterDayFile, type ItemCounts } from './usage-counts';
import { hasPublishedDayHistory, rekey } from './usage-migration';
import { periodDays } from './usage-retention';
import type { UsageSettings } from './usage-settings';
import type { DayRead } from './usage-store';

/** One item's counts for the period, with the breakdown people see. */
export type UsageItem = {
  address: string;
  total: number;
  byOperation: Record<string, number>;
  byOrigin: Record<string, number>;
};

/** The series of one measure. Measures are never summed together. */
export type UsageSeries = {
  measure: UsageMeasure;
  label: string;
  from: string;
  to: string;
  total: number;
  unavailableDays: string[];
  items: UsageItem[];
  /** Counts that did not fit the per-day entry cap; present only for a reader who may read every file. */
  otherTotal?: number;
};

/** The answer of `usage.read`. It holds no identity. */
export type UsageAnswer = { counters: { enabled: boolean; retentionDays?: number }; measures: UsageSeries[] };

/** Everything the answer is computed from. */
export type UsageReadInput = {
  settings: UsageSettings;
  project: string;
  /** Days in the period, counted back from today and including it. */
  days: number;
  /** UTC day today. */
  today: string;
  /** What reading each day of the period found. */
  unverifiedDays?: ReadonlySet<string>;
  dayReads: ReadonlyMap<string, DayRead>;
  /** Counts memory holds that are not yet on disk. */
  pending: readonly CounterDayFile[];
  /** Address migration records in order, or null when the history cannot be read. */
  records: readonly MigrationRecord[] | null;
  /** Whether the reader may read a document of the project, by its path. */
  canRead: (documentPath: string) => boolean;
  /** Whether the item still resolves in the chosen published snapshot. */
  resolves: (address: string) => boolean;
  /** Whether the reader may read every file of the project. */
  readsWholeProject: boolean;
};

/** Parses the `days` query: a whole number from 1 to the retention, the retention when absent. */
export function parseUsageQuery(params: URLSearchParams, retentionDays: number): { days: number } {
  for (const name of params.keys()) if (name !== 'days') throw new BadRequestError('Unknown query parameter.');
  const text = params.get('days');
  if (text === null) return { days: retentionDays };
  const days = Number(text);
  if (!/^\d+$/.test(text) || days < 1 || days > retentionDays) throw new BadRequestError(`days must be a whole number from 1 to ${retentionDays}.`);
  return { days };
}

function sumBy(item: ItemCounts, measure: string, level: 'operation' | 'origin'): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const [operation, byOrigin] of Object.entries(item[measure] ?? {})) {
    for (const [origin, amount] of Object.entries(byOrigin)) {
      const key = level === 'operation' ? operation : origin;
      sums[key] = (sums[key] ?? 0) + amount;
    }
  }
  return Object.fromEntries(Object.entries(sums).sort(([left], [right]) => left.localeCompare(right)));
}

/** The document path of an address that belongs to the project, or null for any other address. */
function documentOf(address: string, project: string): string | null {
  const parsed = parseAddress(address);
  if (!parsed.ok || parsed.address.project !== project || !parsed.address.document) return null;
  return parsed.address.document.join('/');
}

function collect(input: UsageReadInput, period: string[], records: readonly MigrationRecord[]) {
  const merged: Record<string, ItemCounts> = {};
  const unavailable: string[] = [];
  let other = 0;
  const take = (file: CounterDayFile) => {
    for (const [address, item] of Object.entries(file.counts)) mergeItem((merged[address] ??= {}), item);
    other += file.other ?? 0;
  };
  for (const day of period) {
    const read = input.dayReads.get(day);
    const verified = read?.status === 'ok' && hasPublishedDayHistory(read.file, records);
    if (input.unverifiedDays?.has(day) || read?.status === 'damaged' || (read?.status === 'ok' && !verified)) unavailable.push(day);
    if (read?.status === 'ok' && verified) take(rekey(read.file, records));
  }
  for (const file of input.pending) if (period.includes(file.day) && hasPublishedDayHistory(file, records)) take(rekey(file, records));
  return { merged, unavailable, other };
}

function series(input: UsageReadInput, measure: UsageMeasure): UsageSeries {
  const period = periodDays(input.today, input.days);
  // Counts cannot be moved to current addresses without the history, so none are shown.
  const history = input.records;
  const { merged, unavailable, other } = history ? collect(input, period, history) : { merged: {}, unavailable: period, other: 0 };
  const items: UsageItem[] = [];
  for (const address of Object.keys(merged).sort()) {
    const document = documentOf(address, input.project);
    const total = measureTotal(merged[address], measure);
    if (document === null || total === 0 || !input.canRead(document) || !input.resolves(address)) continue;
    items.push({ address, total, byOperation: sumBy(merged[address], measure, 'operation'), byOrigin: sumBy(merged[address], measure, 'origin') });
  }
  const shown = items.reduce((sum, item) => sum + item.total, 0);
  return {
    measure,
    label: USAGE_MEASURE_LABELS[measure],
    from: period[0],
    to: period.at(-1)!,
    total: shown,
    unavailableDays: unavailable,
    items,
    ...(input.readsWholeProject && other > 0 ? { otherTotal: other } : {}),
  };
}

/** Computes the answer for one project and period. */
export function readUsage(input: UsageReadInput): UsageAnswer {
  if (!input.settings.enabled) return { counters: { enabled: false }, measures: [] };
  return { counters: { enabled: true, retentionDays: input.settings.retentionDays }, measures: USAGE_MEASURES.map(measure => series(input, measure)) };
}
