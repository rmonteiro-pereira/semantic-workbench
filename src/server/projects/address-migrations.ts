/** Stages bounded ordered address history inside the journal that owns the definition change. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAddress } from '../../shared/core/item-address';
import { validateDeclaredMigrations, type DeclaredMigration } from '../../shared/core/address-migration';
import type { MigrationFile, MigrationKind, MigrationRecord } from '../../shared/core/address-migration';
import { atomicWrite, decode, readJsonFile } from './atomic';
import { BadRequestError, OccupiedError } from './errors';
import { assertSlug, projectFile, projectPrefix, repoDir, type DataLayout } from './paths';
import type { Reader } from './reader';
import type { Git } from './git';

/** Maximum uncompacted records retained by one project's durable history. */
export const ADDRESS_MIGRATION_LIMIT = 50_000;
const kinds = new Set<MigrationKind>(['item', 'scope', 'document', 'reconciliation', 'deleted']);

/** Names the repository bookkeeping file in each project folder. */
export const ADDRESS_HISTORY_FILE = '.semantic-workbench-address-migrations.jsonl';

/** Locates a project's history in the selected working copy. */
export const addressMigrationFile = (layout: DataLayout, project: string) => projectFile(layout, project, ADDRESS_HISTORY_FILE);

const legacyFile = (layout: DataLayout, project: string) => join(layout.state, 'address-migrations', assertSlug(project) + '.json');

function recordAddress(value: unknown) {
  if (typeof value !== 'string') throw new BadRequestError('Invalid migration address.');
  const parsed = parseAddress(value);
  if (!parsed.ok || parsed.address.form !== 'absolute' || parsed.address.snapshot !== undefined || parsed.address.chain.some(segment => 'position' in segment)) {
    throw new BadRequestError('Migration addresses must be stable absolute locators.');
  }
  return parsed.address;
}

function checkedRecord(input: unknown, project?: string): MigrationRecord {
  const value = input as MigrationRecord | null;
  if (
    !value ||
    typeof value !== 'object' ||
    !kinds.has(value.kind) ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.at !== 'string' ||
    !Number.isFinite(Date.parse(value.at)) ||
    typeof value.commit !== 'string'
  ) {
    throw new BadRequestError('Invalid address migration record.');
  }
  const from = recordAddress(value.from);
  const to = value.kind === 'deleted' ? null : recordAddress(value.to);
  if (value.kind === 'deleted' && value.to !== undefined) throw new BadRequestError('Deleted markers cannot redirect an address.');
  if (value.from === value.to) throw new BadRequestError('An address migration must change its prefix.');
  if (value.kind === 'document') {
    if (from.chain.length || to!.chain.length || (project !== undefined && from.project !== project && to!.project !== project)) throw new BadRequestError('Invalid document migration scope.');
  } else if ((project !== undefined && from.project !== project) || (to && to.project !== from.project)) throw new BadRequestError('Migration is outside its project.');
  return { id: value.id, kind: value.kind, from: value.from, ...(to ? { to: value.to } : {}), at: value.at, commit: value.commit };
}

function legacyRecords(layout: DataLayout, project: string): MigrationRecord[] {
  const value = readJsonFile<MigrationFile>(legacyFile(layout, project));
  if (value === null) return [];
  if (value.formatVersion !== 1 || !Array.isArray(value.records) || value.records.length > ADDRESS_MIGRATION_LIMIT) throw new BadRequestError('Unsupported address migration store.');
  return value.records.map(record => checkedRecord(record));
}

/** Reads merged lines, preserving the first record for each id. */
export function parseAddressHistory(source: string): MigrationRecord[] {
  const byId = new Map<string, MigrationRecord>();
  for (const line of source.split('\n')) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new BadRequestError('Invalid address history JSON line.');
    }
    const record = checkedRecord(value);
    if (!byId.has(record.id)) byId.set(record.id, record);
    if (byId.size > ADDRESS_MIGRATION_LIMIT) throw new BadRequestError('Address migration history reached its 50,000-record limit.');
  }
  return [...byId.values()].sort((left, right) => Date.parse(left.at) - Date.parse(right.at) || left.id.localeCompare(right.id, 'en', { numeric: true }));
}

function loadRecords(layout: DataLayout, project: string): MigrationRecord[] {
  const file = addressMigrationFile(layout, project);
  if (!existsSync(file)) return legacyRecords(layout, project);
  return parseAddressHistory(readFileSync(file, 'utf8'));
}

/** Selects records introduced on the destination side in its replay order. */
export function addressHistoryDifference(from: readonly MigrationRecord[], to: readonly MigrationRecord[]): MigrationRecord[] {
  const previous = new Set(from.map(record => record.id));
  return to.filter(record => !previous.has(record.id));
}

function readableRecord(record: MigrationRecord, reader: Reader): boolean {
  if (!reader.view) return true;
  return [record.from, record.to]
    .filter((value): value is string => value !== undefined)
    .every(value => {
      const address = parseAddress(value);
      if (!address.ok || !reader.view!.readableProjects.has(address.address.project!)) return false;
      return !address.address.document || reader.view!.canRead(address.address.project!, address.address.document.join('/'));
    });
}

/** Reads history only after project visibility is established and filters every record's endpoints. */
export function readAddressMigrations(layout: DataLayout, project: string, reader: Reader): MigrationRecord[] {
  if (reader.view && !reader.view.readableProjects.has(project)) return [];
  return loadRecords(layout, project).filter(record => readableRecord(record, reader));
}

/** Reads a history from an already-authorized immutable Git commit. */
export async function readCommittedAddressMigrations(git: Git, layout: DataLayout, project: string, commit: string, reader: Reader): Promise<MigrationRecord[]> {
  if (reader.view && !reader.view.readableProjects.has(project)) return [];
  const directory = repoDir(layout, project);
  const path = projectPrefix(layout, project) + ADDRESS_HISTORY_FILE;
  const entry = (await git.lsTree(directory, commit, path)).find(candidate => candidate.path === path);
  if (!entry) return legacyRecords(layout, project).filter(record => readableRecord(record, reader));
  const maximumBytes = ADDRESS_MIGRATION_LIMIT * 9_000;
  const blobs = await git.catFileBatch(directory, [entry.id], { documentBytes: maximumBytes, totalBytes: maximumBytes });
  const bytes = blobs.get(entry.id);
  if (!bytes) throw new BadRequestError('Address history is unavailable.');
  return parseAddressHistory(decode(bytes)).filter(record => readableRecord(record, reader));
}

/** Assigns repeatable record identifiers from the journal's business operation identifier. */
export function operationMigrations(operation: { id: string; at: string; commit: string }, changes: readonly Omit<MigrationRecord, 'id' | 'at' | 'commit'>[]): MigrationRecord[] {
  if (!operation.id) throw new BadRequestError('A migration operation identifier is required.');
  return changes.map((change, index) => {
    let prefix = 'm';
    if (change.kind === 'deleted') prefix = 'd';
    if (change.kind === 'reconciliation') prefix = 'r';
    return { ...change, id: `${prefix}-${operation.id}-${index}`, at: operation.at, commit: operation.commit };
  });
}

/** Prepares an idempotent append, refusing overflow before any existing file is moved. */
export function stageAddressMigrations(context: { layout: DataLayout; project: string; staging: string }, appended: readonly MigrationRecord[]): { from: string; to: string }[] {
  const { layout, project, staging } = context;
  const legacy = legacyFile(layout, project);
  if (!appended.length && !existsSync(legacy)) return [];
  const destination = addressMigrationFile(layout, project);
  const existed = existsSync(destination);
  const previousSource = existed ? readFileSync(destination, 'utf8') : '';
  const records = existed ? parseAddressHistory(previousSource) : legacyRecords(layout, project);
  const additions = existed ? [] : [...records];
  const byId = new Map(records.map(record => [record.id, record]));
  for (const input of appended) {
    const record = checkedRecord(input, project);
    const previous = byId.get(record.id);
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(record)) throw new BadRequestError('A migration operation was replayed with different content.');
      continue;
    }
    additions.push(record);
    byId.set(record.id, record);
  }
  if (byId.size > ADDRESS_MIGRATION_LIMIT) throw new BadRequestError('Address migration history reached its 50,000-record limit. Definitions were not changed.');
  if (!additions.length && existed && !existsSync(legacy)) return [];
  const staged = join(staging, `address-migrations-${project}.jsonl`);
  const steps = [];
  if (existed) steps.push({ from: destination, to: staged + '.previous' });
  const separator = previousSource && !previousSource.endsWith('\n') ? '\n' : '';
  atomicWrite(staged, previousSource + separator + additions.map(record => JSON.stringify(record) + '\n').join(''));
  steps.push({ from: staged, to: destination });
  if (!existed) steps.push(...stageHistoryAttributes(layout, project, staging));
  if (existsSync(legacy)) steps.push({ from: legacy, to: staged + '.legacy' });
  return steps;
}

function stageHistoryAttributes(layout: DataLayout, project: string, staging: string) {
  const destination = projectFile(layout, project, '.gitattributes');
  const existed = existsSync(destination);
  const previous = existed ? readFileSync(destination, 'utf8') : '';
  const rule = `/${ADDRESS_HISTORY_FILE} merge=union`;
  if (previous.split(/\r?\n/).includes(rule)) return [];
  const staged = join(staging, `attributes-${project}`);
  const separator = previous && !previous.endsWith('\n') ? '\n' : '';
  atomicWrite(staged, previous + separator + rule + '\n');
  return [...(existed ? [{ from: destination, to: staged + '.previous' }] : []), { from: staged, to: destination }];
}

/** Validates an optional save declaration list without exposing locator text in refusal errors. */
export function declaredAddressMigrations(input: unknown, project: string, documents: readonly string[]): DeclaredMigration[] {
  const result = validateDeclaredMigrations(input, project, documents);
  if (!result.ok) throw new BadRequestError(`Invalid declared migrations: ${result.reason}.`);
  return result.migrations;
}

/** Moves a project's complete history into the same archive as its definitions. */
export function archiveAddressMigrations(layout: DataLayout, project: string, archive: string): { from: string; to: string }[] {
  const from = legacyFile(layout, project);
  return existsSync(from) ? [{ from, to: join(archive, 'address-migrations', assertSlug(project) + '.json') }] : [];
}

/** Restores archived history without rewriting its original endpoints or overwriting another store. */
export function restoreAddressMigrations(layout: DataLayout, originalProject: string, targetProject: string, archive: string): { from: string; to: string }[] {
  const from = join(archive, 'address-migrations', assertSlug(originalProject) + '.json');
  if (!existsSync(from)) return [];
  const to = legacyFile(layout, targetProject);
  if (existsSync(to)) throw new OccupiedError('Address history already exists for the restored project.', {});
  return [{ from, to }];
}

/** Validates explicit item-deletion prefixes within the files owned by a save request. */
export function declaredDeletedItems(input: unknown, project: string, documents: readonly string[]): string[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > ADDRESS_MIGRATION_LIMIT) throw new BadRequestError('Invalid deleted item list.');
  const written = new Set(documents);
  const addresses = input.map(value => {
    const address = recordAddress(value);
    if (address.project !== project || !address.document || !written.has(address.document.join('/')) || !address.chain.length)
      throw new BadRequestError('Deleted items must belong to the written files.');
    return value as string;
  });
  if (new Set(addresses).size !== addresses.length) throw new BadRequestError('Each deleted item may be declared once.');
  return addresses;
}

/** Matches a record to the definition paths it describes within a repository. */
export function historyEndpoints(record: MigrationRecord, prefix: (project: string) => string | undefined): string[] {
  return [record.from, record.to].flatMap(value => {
    if (!value) return [];
    const parsed = parseAddress(value);
    if (!parsed.ok || !parsed.address.project || !parsed.address.document) return [];
    const folder = prefix(parsed.address.project);
    return folder === undefined ? [] : [folder + parsed.address.document.join('/')];
  });
}

/** Serializes replay records for a Git index entry. */
export function serializeAddressHistory(records: readonly MigrationRecord[]): string {
  return records.map(record => JSON.stringify(record) + '\n').join('');
}

/** Prepares a working history rewrite for the same journal as a discard or restore. */
export function stageHistoryRemoval(
  context: { layout: DataLayout; project: string; staging: string },
  discard: (record: MigrationRecord) => boolean,
  archive?: string,
): { from: string; to: string }[] {
  const { layout, project, staging } = context;
  const destination = addressMigrationFile(layout, project);
  if (!existsSync(destination)) return [];
  const records = parseAddressHistory(readFileSync(destination, 'utf8'));
  const removed = records.filter(discard);
  if (!removed.length) return [];
  const excluded = new Set(removed.map(record => record.id));
  const staged = join(staging, 'remaining-address-history');
  atomicWrite(staged, serializeAddressHistory(records.filter(record => !excluded.has(record.id))));
  const steps = [
    { from: destination, to: staged + '.previous' },
    { from: staged, to: destination },
  ];
  if (archive) {
    const archived = staged + '.removed';
    atomicWrite(archived, serializeAddressHistory(removed));
    steps.push({ from: archived, to: archive });
  }
  return steps;
}

/** Location of the undo payload for records removed with a reverted definition. */
export const trashedAddressHistory = (entry: string) => join(entry, 'address-history.jsonl');

/** Reads the undo payload for a reverted definition, if it had any records. */
export function readTrashedAddressHistory(entry: string): MigrationRecord[] {
  const path = trashedAddressHistory(entry);
  return existsSync(path) ? parseAddressHistory(readFileSync(path, 'utf8')) : [];
}
