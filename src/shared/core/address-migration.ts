/** Applies recorded locator changes without filesystem, authorization or clock access. */
import * as itemAddress from './item-address';
import { parseAddress, replacePrefix, type Address } from './item-address';

/** Identifies the operation that changed a locator prefix. */
export type MigrationKind = 'item' | 'scope' | 'document' | 'reconciliation' | 'deleted';
/** Records an ordered prefix change, independently of any person identity. */
export type MigrationRecord = {
  id: string;
  kind: MigrationKind;
  from: string;
  to?: string;
  at: string;
  commit: string;
};
/** Holds the bounded migration history for one project. */
export type MigrationFile = { formatVersion: 1; records: MigrationRecord[] };
/** Declares a client-observed rename within the files being saved. */
export type DeclaredMigration = { kind: 'item' | 'scope'; from: string; to: string };
/** Gives a closed validation failure without returning source locator text. */
export type MigrationFailure = 'shape' | 'limit' | 'address' | 'project' | 'document' | 'unchanged' | 'volatile' | 'scope';
/** Returns validated declarations or the index and reason of their refusal. */
export type DeclaredMigrationResult = { ok: true; migrations: DeclaredMigration[] } | { ok: false; reason: MigrationFailure; index?: number };

function stableAbsolute(text: string): Address | null {
  const parsed = parseAddress(text);
  if (!parsed.ok || parsed.address.form !== 'absolute' || parsed.address.snapshot !== undefined) return null;
  return parsed.address;
}

/** Applies each distinct record once in append order, preserving a resolving input. */
export function migrateAddress(address: Address, records: readonly MigrationRecord[], resolved: boolean): Address {
  if (resolved) return address;
  let current = address;
  const applied = new Set<string>();
  for (const record of records) {
    if (applied.has(record.id)) continue;
    applied.add(record.id);
    const from = stableAbsolute(record.from);
    if (!from) continue;
    if (record.kind === 'deleted') {
      if (itemAddress.hasPrefix(current, from)) return current;
      continue;
    }
    const to = record.to === undefined ? null : stableAbsolute(record.to);
    if (to) current = replacePrefix(current, from, to);
  }
  return current;
}

function validatePair(declaration: DeclaredMigration, project: string, documents: ReadonlySet<string>): MigrationFailure | null {
  const from = stableAbsolute(declaration.from);
  const to = stableAbsolute(declaration.to);
  if (!from || !to || !from.chain.length || !to.chain.length) return 'address';
  if (from.project !== project || to.project !== project) return 'project';
  if (!from.document || !to.document || !documents.has(from.document.join('/')) || !documents.has(to.document.join('/'))) return 'document';
  if (declaration.from === declaration.to) return 'unchanged';
  if ([...from.chain, ...to.chain].some(segment => 'position' in segment)) return 'volatile';
  const scopes = new Set(['ontology', 'model', 'mapping', 'contract']);
  if (declaration.kind === 'scope' && (!scopes.has(from.chain.at(-1)!.kind) || from.chain.at(-1)!.kind !== to.chain.at(-1)!.kind)) return 'scope';
  return null;
}

/** Validates an optional request list against the project and all files written by that request. */
export function validateDeclaredMigrations(input: unknown, project: string, writtenDocuments: readonly string[]): DeclaredMigrationResult {
  if (input === undefined) return { ok: true, migrations: [] };
  if (!Array.isArray(input)) return { ok: false, reason: 'shape' };
  if (input.length > 64) return { ok: false, reason: 'limit' };
  const documents = new Set(writtenDocuments);
  const migrations: DeclaredMigration[] = [];
  for (const [index, value] of input.entries()) {
    if (!value || typeof value !== 'object' || (value.kind !== 'item' && value.kind !== 'scope') || typeof value.from !== 'string' || typeof value.to !== 'string') {
      return { ok: false, reason: 'shape', index };
    }
    const declaration: DeclaredMigration = { kind: value.kind, from: value.from, to: value.to };
    const reason = validatePair(declaration, project, documents);
    if (reason) return { ok: false, reason, index };
    migrations.push(declaration);
  }
  return { ok: true, migrations };
}

/** Computes a deterministic retention cut from an instant and a whole-day setting. */
export function migrationRetentionCut(nowMilliseconds: number, retentionDays: number): number {
  if (!Number.isFinite(nowMilliseconds) || !Number.isSafeInteger(retentionDays) || retentionDays < 1) throw new RangeError('Migration retention requires a finite instant and positive whole days.');
  return nowMilliseconds - retentionDays * 86_400_000;
}
