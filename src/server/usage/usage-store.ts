// Reads and writes the day files under state/usage. This is the only usage module that touches the
// disk. A damaged file is reported to the caller and never repaired or deleted by a read.
import { closeSync, constants, existsSync, fstatSync, openSync, readdirSync, readSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWrite, type AtomicHooks } from '../projects/atomic';
import { assertSlug, type DataLayout } from '../projects/paths';
import { CALLER_ORIGINS } from '../auth/operation-inventory';
import { countedOperation, USAGE_MEASURES } from './usage-counted-operations';
import { itemTotal, MAX_ADDRESSES_PER_DAY, MAX_COUNT, type CounterDayFile, type ItemCounts } from './usage-counts';
import { isDay } from './usage-retention';

/** What reading one day file found. */
export type DayRead = { status: 'missing' } | { status: 'ok'; file: CounterDayFile } | { status: 'damaged' };

const MAX_DAY_BYTES = 64 * 1024 * 1024;
const DAY_FILE_FIELDS = ['counts', 'day', 'formatVersion', 'migratedThrough', 'other', 'project'];
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_COUNT;

function parseItem(value: unknown): ItemCounts | null {
  if (!isRecord(value)) return null;
  for (const [measure, byOperation] of Object.entries(value)) {
    if (!(USAGE_MEASURES as readonly string[]).includes(measure) || !isRecord(byOperation)) return null;
    for (const [operation, byOrigin] of Object.entries(byOperation)) {
      if (countedOperation(operation)?.measure !== measure || !isRecord(byOrigin)) return null;
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
  let size = 0;
  for (const address in value.counts) {
    if (!Object.hasOwn(value.counts, address)) continue;
    size += 1;
    if (size > MAX_ADDRESSES_PER_DAY || !parseItem(value.counts[address])) return null;
  }
  return value as CounterDayFile;
}

function readDayJson(path: string): unknown {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_DAY_BYTES) return null;
    const bytes = Buffer.allocUnsafe(stat.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = readSync(fd, bytes, length, bytes.length - length, null);
      if (!read) break;
      length += read;
    }
    if (length !== stat.size) return null;
    return JSON.parse(bytes.toString('utf8', 0, length));
  } finally {
    closeSync(fd);
  }
}

function boundedDay(file: CounterDayFile): CounterDayFile {
  const counts: CounterDayFile['counts'] = Object.create(null);
  let other = file.other ?? 0;
  let remaining = MAX_DAY_BYTES - Buffer.byteLength(JSON.stringify({ ...file, counts, other: MAX_COUNT })) - 1;
  let size = 0;
  for (const [address, item] of Object.entries(file.counts)) {
    const bytes = Buffer.byteLength(JSON.stringify(address)) + Buffer.byteLength(JSON.stringify(item)) + 2;
    if (bytes > remaining || size === MAX_ADDRESSES_PER_DAY) {
      other = Math.min(MAX_COUNT, other + itemTotal(item));
      continue;
    }
    counts[address] = item;
    remaining -= bytes;
    size += 1;
  }
  return { ...file, counts, ...(other ? { other } : {}) };
}

/** The disk side of the counters, bound to one data layout. */
export function createUsageStore(layout: DataLayout) {
  const projectFolder = (project: string) => join(layout.usage, assertSlug(project));
  const dayPath = (project: string, day: string) => join(projectFolder(project), `${day}.json`);

  /** The first preserved copy keeps the plain name; later copies of the same day are numbered. */
  function unverifiedPath(project: string, day: string, copy: number): string {
    const suffix = copy === 0 ? '' : `.${copy}`;
    return join(projectFolder(project), `${day}.unverified${suffix}.json`);
  }

  function unverifiedPaths(project: string, day: string): string[] {
    const folder = projectFolder(project);
    if (!existsSync(folder)) return [];
    const pattern = new RegExp(`^${day}\\.unverified(?:\\.\\d+)?\\.json$`);
    return readdirSync(folder)
      .filter(name => pattern.test(name))
      .map(name => join(folder, name));
  }

  /**
   * Keeps an unverified day whole before a new day is written at its original path.
   * A day can lose its verified history more than once, so an earlier copy is never overwritten.
   */
  function preserveUnverifiedDay(project: string, day: string): void {
    let copy = 0;
    while (existsSync(unverifiedPath(project, day, copy))) copy += 1;
    renameSync(dayPath(project, day), unverifiedPath(project, day, copy));
  }

  function hasUnverifiedDay(project: string, day: string): boolean {
    return unverifiedPaths(project, day).length > 0;
  }

  function readDay(project: string, day: string): DayRead {
    try {
      const file = parseDayFile(readDayJson(dayPath(project, day)), project, day);
      return file ? { status: 'ok', file } : { status: 'damaged' };
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT' ? { status: 'missing' } : { status: 'damaged' };
    }
  }

  /** Replaces a day file atomically, so an interrupted write leaves the old file whole. */
  function writeDay(file: CounterDayFile, hooks?: AtomicHooks): void {
    atomicWrite(dayPath(file.project, file.day), JSON.stringify(boundedDay(file)) + '\n', hooks);
  }

  function listDays(project: string): string[] {
    const folder = projectFolder(project);
    if (!existsSync(folder)) return [];
    const days = readdirSync(folder)
      .filter(name => name.endsWith('.json'))
      .map(name => name.replace(/(?:\.unverified(?:\.\d+)?)?\.json$/, ''))
      .filter(isDay);
    return [...new Set(days)].sort();
  }

  function listProjects(): string[] {
    if (!existsSync(layout.usage)) return [];
    return readdirSync(layout.usage).filter(name => existsSync(projectFolder(name)));
  }

  function deleteDay(project: string, day: string): void {
    rmSync(dayPath(project, day), { force: true });
    for (const path of unverifiedPaths(project, day)) rmSync(path, { force: true });
  }

  return { readDay, writeDay, listDays, listProjects, deleteDay, dayPath, projectFolder, preserveUnverifiedDay, hasUnverifiedDay };
}

/** The disk side of the counters. */
export type UsageStore = ReturnType<typeof createUsageStore>;
