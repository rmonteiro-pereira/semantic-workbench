// Reads and writes the day files under state/usage. This is the only usage module that touches the
// disk. A damaged file is reported to the caller and never repaired or deleted by a read.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWrite, type AtomicHooks } from '../projects/atomic';
import { assertSlug, type DataLayout } from '../projects/paths';
import { CALLER_ORIGINS } from '../auth/operation-inventory';
import { USAGE_MEASURES } from './usage-counted-operations';
import { MAX_COUNT, type CounterDayFile, type ItemCounts } from './usage-counts';
import { isDay } from './usage-retention';

/** What reading one day file found. */
export type DayRead = { status: 'missing' } | { status: 'ok'; file: CounterDayFile } | { status: 'damaged' };

const DAY_FILE_FIELDS = ['counts', 'day', 'formatVersion', 'migratedThrough', 'other', 'project'];
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_COUNT;

function parseItem(value: unknown): ItemCounts | null {
  if (!isRecord(value)) return null;
  for (const [measure, byOperation] of Object.entries(value)) {
    if (!(USAGE_MEASURES as readonly string[]).includes(measure) || !isRecord(byOperation)) return null;
    for (const byOrigin of Object.values(byOperation)) {
      if (!isRecord(byOrigin)) return null;
      for (const [origin, amount] of Object.entries(byOrigin)) {
        if (!(CALLER_ORIGINS as readonly string[]).includes(origin) || !isCount(amount)) return null;
      }
    }
  }
  return value as ItemCounts;
}

/** Validates stored JSON into a day file, or null when anything about it is unexpected. */
export function parseDayFile(value: unknown, project: string, day: string): CounterDayFile | null {
  if (!isRecord(value) || Object.keys(value).some(key => !DAY_FILE_FIELDS.includes(key))) return null;
  if (value.formatVersion !== 1 || value.project !== project || value.day !== day) return null;
  if (value.migratedThrough !== null && typeof value.migratedThrough !== 'string') return null;
  if (value.other !== undefined && !isCount(value.other)) return null;
  if (!isRecord(value.counts)) return null;
  for (const item of Object.values(value.counts)) if (!parseItem(item)) return null;
  return value as CounterDayFile;
}

/** The disk side of the counters, bound to one data layout. */
export function createUsageStore(layout: DataLayout) {
  const projectFolder = (project: string) => join(layout.usage, assertSlug(project));
  const dayPath = (project: string, day: string) => join(projectFolder(project), `${day}.json`);

  function readDay(project: string, day: string): DayRead {
    let text: string;
    try {
      text = readFileSync(dayPath(project, day), 'utf8');
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT' ? { status: 'missing' } : { status: 'damaged' };
    }
    try {
      const file = parseDayFile(JSON.parse(text), project, day);
      return file ? { status: 'ok', file } : { status: 'damaged' };
    } catch {
      return { status: 'damaged' };
    }
  }

  /** Replaces a day file atomically, so an interrupted write leaves the old file whole. */
  function writeDay(file: CounterDayFile, hooks?: AtomicHooks): void {
    atomicWrite(dayPath(file.project, file.day), JSON.stringify(file) + '\n', hooks);
  }

  function listDays(project: string): string[] {
    const folder = projectFolder(project);
    if (!existsSync(folder)) return [];
    return readdirSync(folder)
      .filter(name => name.endsWith('.json') && isDay(name.slice(0, -5)))
      .map(name => name.slice(0, -5))
      .sort();
  }

  function listProjects(): string[] {
    if (!existsSync(layout.usage)) return [];
    return readdirSync(layout.usage).filter(name => existsSync(projectFolder(name)));
  }

  function deleteDay(project: string, day: string): void {
    rmSync(dayPath(project, day), { force: true });
  }

  return { readDay, writeDay, listDays, listProjects, deleteDay, dayPath, projectFolder };
}

/** The disk side of the counters. */
export type UsageStore = ReturnType<typeof createUsageStore>;
