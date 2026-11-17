/** Stages bounded ordered address history inside the journal that owns the definition change. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseAddress } from '../../shared/core/item-address';
import { validateDeclaredMigrations, type DeclaredMigration } from '../../shared/core/address-migration';
import type { MigrationFile, MigrationKind, MigrationRecord } from '../../shared/core/address-migration';
import { atomicWriteJson, readJsonFile } from './atomic';
import { BadRequestError, OccupiedError } from './errors';
import { assertSlug, type DataLayout } from './paths';
import type { Reader } from './reader';

/** Maximum uncompacted records retained by one project's durable history. */
export const ADDRESS_MIGRATION_LIMIT = 50_000;
const kinds = new Set<MigrationKind>(['item', 'scope', 'document', 'reconciliation', 'deleted']);

/** Locates a project's migration file without opening its contents. */
export const addressMigrationFile = (layout: DataLayout, project: string) => join(layout.state, 'address-migrations', assertSlug(project) + '.json');

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

function loadRecords(layout: DataLayout, project: string): MigrationRecord[] {
  const value = readJsonFile<MigrationFile>(addressMigrationFile(layout, project));
  if (value === null) return [];
  if (value.formatVersion !== 1 || !Array.isArray(value.records) || value.records.length > ADDRESS_MIGRATION_LIMIT) throw new BadRequestError('Unsupported address migration store.');
  return value.records.map(record => checkedRecord(record));
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
  if (!appended.length) return [];
  const { layout, project, staging } = context;
  const records = loadRecords(layout, project);
  const byId = new Map(records.map(record => [record.id, record]));
  for (const input of appended) {
    const record = checkedRecord(input, project);
    const previous = byId.get(record.id);
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(record)) throw new BadRequestError('A migration operation was replayed with different content.');
      continue;
    }
    records.push(record);
    byId.set(record.id, record);
  }
  if (records.length > ADDRESS_MIGRATION_LIMIT) throw new BadRequestError('Address migration history reached its 50,000-record limit. Definitions were not changed.');
  const destination = addressMigrationFile(layout, project);
  const staged = join(staging, `address-migrations-${project}.json`);
  atomicWriteJson(staged, { formatVersion: 1, records });
  return [...(existsSync(destination) ? [{ from: destination, to: staged + '.previous' }] : []), { from: staged, to: destination }];
}

/** Validates an optional save declaration list without exposing locator text in refusal errors. */
export function declaredAddressMigrations(input: unknown, project: string, documents: readonly string[]): DeclaredMigration[] {
  const result = validateDeclaredMigrations(input, project, documents);
  if (!result.ok) throw new BadRequestError(`Invalid declared migrations: ${result.reason}.`);
  return result.migrations;
}

/** Moves a project's complete history into the same archive as its definitions. */
export function archiveAddressMigrations(layout: DataLayout, project: string, archive: string): { from: string; to: string }[] {
  const from = addressMigrationFile(layout, project);
  return existsSync(from) ? [{ from, to: join(archive, 'address-migrations', assertSlug(project) + '.json') }] : [];
}

/** Restores archived history without rewriting its original endpoints or overwriting another store. */
export function restoreAddressMigrations(layout: DataLayout, originalProject: string, targetProject: string, archive: string): { from: string; to: string }[] {
  const from = join(archive, 'address-migrations', assertSlug(originalProject) + '.json');
  if (!existsSync(from)) return [];
  const to = addressMigrationFile(layout, targetProject);
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
