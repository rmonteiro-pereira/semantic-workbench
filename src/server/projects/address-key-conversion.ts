/** Converts durable grouping keys once, preserving verified originals in a backup. */
import { existsSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { inspect } from '../../shared/core/model';
import { encodeGrouping, type GroupingAssignments } from '../../shared/core/grouping-addresses';
import { InputError } from '../../shared/validation/diagnostics';
import { atomicWrite, atomicWriteJson, decode, sha256 } from './atomic';
import { addressKeyStores, type AddressKeyStore } from './address-key-stores';
import { JournalCrash, type Journal } from './journal';
import type { DataLayout } from './paths';

/** Accounts for each converted assignment and each original key that remains unchanged. */
export type AddressKeyConversionReport = {
  formatVersion: 1;
  backup: string;
  converted: number;
  kept: { store: string; document: string; key: string }[];
  originals: { path: string; hash: string }[];
};
/** Allows verification failures to be tested before any store is installed. */
export type AddressKeyConversionHooks = { beforeVerify?: (backup: string) => void };

type Conversion = {
  root: string;
  originals: Map<string, string>;
  models: Map<string, ReturnType<typeof inspect> | null>;
  report: AddressKeyConversionReport;
};

function original(path: string, conversion: Conversion): Uint8Array {
  const resolved = realpathSync(path);
  if (!resolved.startsWith(conversion.root + sep)) throw new Error('Address-key source escapes the data root.');
  const bytes = readFileSync(path);
  conversion.originals.set(path, sha256(bytes));
  return bytes;
}

function modelFor(store: AddressKeyStore, document: string, conversion: Conversion) {
  const path = store.source(document);
  if (!path || !existsSync(path)) return null;
  if (conversion.models.has(path)) return conversion.models.get(path)!;
  let model: ReturnType<typeof inspect> | null;
  try {
    model = inspect(decode(original(path, conversion)), document);
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
    model = null;
  }
  conversion.models.set(path, model);
  return model;
}

function grouping(value: unknown): GroupingAssignments {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['mode', 'assignments', 'names'].includes(key))) {
    throw new Error('Unknown persisted grouping shape; conversion stopped.');
  }
  for (const key of ['assignments', 'names']) {
    const entries = (value as Record<string, unknown>)[key];
    if (entries !== undefined && (!entries || typeof entries !== 'object' || Array.isArray(entries) || Object.values(entries).some(entry => typeof entry !== 'string'))) {
      throw new Error('Unknown persisted grouping keys; conversion stopped.');
    }
  }
  return value as GroupingAssignments;
}

function convertGrouping(store: AddressKeyStore, document: string, input: unknown, conversion: Conversion) {
  const value = grouping(input);
  const model = value.assignments ? modelFor(store, document, conversion) : null;
  const encoded = encodeGrouping(value, model?.entities ?? [], { project: store.project, document: document.split('/') });
  const total = Object.keys(value.assignments ?? {}).length;
  conversion.report.converted += total - encoded.unconverted.length;
  for (const key of encoded.unconverted) conversion.report.kept.push({ store: store.path, document, key });
  return encoded.value;
}

function convertStore(store: AddressKeyStore, input: any, conversion: Conversion) {
  if (!input || input.formatVersion !== 1) throw new Error('Unsupported persisted view format; conversion stopped.');
  if (store.embeddedPath) return { ...input, view: convertGrouping(store, store.embeddedPath, input.view, conversion) };
  if (!input.files || typeof input.files !== 'object' || Array.isArray(input.files)) throw new Error('Unknown persisted view shape; conversion stopped.');
  return { ...input, files: Object.fromEntries(Object.entries(input.files).map(([document, value]) => [document, convertGrouping(store, document, value, conversion)])) };
}

/** Backs up and verifies every affected store before journaled installation of converted keys. */
export function convertAddressKeys(context: { layout: DataLayout; journal: Journal }, hooks: AddressKeyConversionHooks = {}): AddressKeyConversionReport | null {
  const { layout, journal } = context;
  const marker = join(layout.state, 'address-key-conversion.json');
  if (existsSync(marker)) return null;
  const operation = journal.newId();
  const staging = join(layout.state, `.address-keys-${operation}`);
  const backup = join(layout.backup, `address-keys-${operation}`);
  const report: AddressKeyConversionReport = { formatVersion: 1, backup, converted: 0, kept: [], originals: [] };
  const conversion: Conversion = { root: realpathSync(layout.root), originals: new Map(), models: new Map(), report };
  const steps: { from: string; to: string }[] = [];
  try {
    for (const [index, store] of addressKeyStores(layout).entries()) {
      const bytes = original(store.path, conversion);
      const next = convertStore(store, JSON.parse(decode(bytes)), conversion);
      atomicWrite(join(backup, relative(layout.root, store.path)), bytes);
      const staged = join(staging, String(index));
      atomicWriteJson(staged, next);
      steps.push({ from: store.path, to: staged + '.previous' }, { from: staged, to: store.path });
      report.originals.push({ path: relative(layout.root, store.path), hash: sha256(bytes) });
    }
    hooks.beforeVerify?.(backup);
    for (const [path, hash] of conversion.originals) {
      if (sha256(readFileSync(path)) !== hash) throw new Error('Original bytes changed; address-key conversion stopped.');
    }
    for (const entry of report.originals) {
      if (sha256(readFileSync(join(backup, entry.path))) !== entry.hash) throw new Error('Backup hash mismatch; address-key conversion stopped.');
    }
    const stagedMarker = join(staging, 'completed.json');
    atomicWriteJson(stagedMarker, report);
    steps.push({ from: stagedMarker, to: marker });
    journal.run('address-key-conversion', steps, [staging], operation);
    return report;
  } catch (error) {
    if (!(error instanceof JournalCrash)) rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
