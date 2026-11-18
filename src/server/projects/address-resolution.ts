/** Resolves structured items only after the caller's project and path visibility checks. */
import { inspect } from '../../shared/core/model';
import { resolveInModel, type AddressedItem } from '../../shared/core/model-addresses';
import { formatAddress, parseAddress, type Address } from '../../shared/core/item-address';
import { deletesAddress, historySinceDeletion, migrateAddress, type MigrationRecord } from '../../shared/core/address-migration';
import { InputError } from '../../shared/validation/diagnostics';
import { NotFoundError } from './errors';
import { assertSlug, projectPath, PathError } from './paths';
import type { Reader } from './reader';

/** Supplies existing workspace reads without widening their caller boundary. */
export type AddressReadContext = {
  projectExists: (project: string) => boolean;
  readFile: (project: string, path: string, reader: Reader) => { source: string };
};
/** Returns source text only for a unique item the caller can already read. */
export type CurrentItemResolution = { status: 'found'; item: AddressedItem; source: string } | { status: 'ambiguous'; items: AddressedItem[] } | { status: 'missing' };

/** Reads no project data for an unreadable project or file and makes hidden equal missing. */
export function resolveCurrentItem(context: AddressReadContext, address: Address, reader: Reader): CurrentItemResolution {
  if (address.form !== 'absolute' || !address.project || !address.document || !address.chain.length) return { status: 'missing' };
  const project = address.project;
  const path = address.document.join('/');
  if (reader.view && (!reader.view.readableProjects.has(project) || !reader.view.canRead(project, path))) return { status: 'missing' };
  try {
    assertSlug(project);
    projectPath(path);
    if (!context.projectExists(project)) return { status: 'missing' };
    const document = context.readFile(project, path, reader);
    const model = inspect(document.source, path);
    if (!('document' in model)) return { status: 'missing' };
    const result = resolveInModel(model.document, address, { project, document: address.document });
    return result.status === 'found' ? { ...result, source: document.source } : result;
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof InputError || error instanceof PathError) return { status: 'missing' };
    throw error;
  }
}

/** Supplies history already filtered by the same reader used for definition reads. */
export type AddressResolutionContext = AddressReadContext & {
  readMigrations: (project: string, reader: Reader) => readonly MigrationRecord[];
};
/** Returns no source text or hidden locator details in a missing result. */
export type CallerResolution = { status: 'found'; address: string; item: AddressedItem } | { status: 'ambiguous'; items: AddressedItem[] } | { status: 'missing' };

function readable(address: Address, reader: Reader): boolean {
  if (!address.project || !address.document) return false;
  return !reader.view || (reader.view.readableProjects.has(address.project) && reader.view.canRead(address.project, address.document.join('/')));
}

function publicResult(result: CurrentItemResolution, address: Address): CallerResolution {
  if (result.status === 'found') return { status: 'found', address: formatAddress(address), item: result.item };
  return result;
}

function* resolveWithHistory(context: AddressResolutionContext, text: string, reader: Reader): Generator<string, CallerResolution> {
  const parsed = parseAddress(text);
  if (!parsed.ok || parsed.address.form !== 'absolute' || !parsed.address.chain.length || !readable(parsed.address, reader)) return { status: 'missing' };
  let address = parsed.address;
  yield address.project!;
  const current = resolveCurrentItem(context, address, reader);
  if (current.status !== 'missing') return publicResult(current, address);
  if (!context.projectExists(address.project!)) return { status: 'missing' };
  let records = context.readMigrations(address.project!, reader);
  const histories = new Map([[address.project!, records]]);
  records = historySinceDeletion(address, records).records;
  const applied = new Set<string>();
  let waitingForReconciliation = false;
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (applied.has(record.id)) continue;
    applied.add(record.id);
    const from = parseAddress(record.from);
    if (!from.ok || !readable(from.address, reader)) continue;
    if (deletesAddress(record, address)) {
      waitingForReconciliation = true;
      continue;
    }
    if (waitingForReconciliation && (record.kind !== 'reconciliation' || record.from !== formatAddress({ ...address, snapshot: undefined }))) continue;
    const to = parseAddress(record.to ?? '');
    if (!to.ok || !readable(to.address, reader)) continue;
    const previousProject = address.project;
    address = migrateAddress(address, [record], false);
    waitingForReconciliation = false;
    if (address.project && address.project !== previousProject) {
      if (!histories.has(address.project)) {
        yield address.project;
        if (!context.projectExists(address.project)) return { status: 'missing' };
        histories.set(address.project, context.readMigrations(address.project, reader));
      }
      records = histories.get(address.project)!;
      // Both stores share the move marker, so earlier destination history belongs to another arrival.
      const arrival = records.findIndex(candidate => candidate.id === record.id);
      if (arrival < 0) return { status: 'missing' };
      records = records.slice(arrival + 1);
      index = -1;
    }
  }
  if (waitingForReconciliation || formatAddress(address) === text) return { status: 'missing' };
  return publicResult(resolveCurrentItem(context, address, reader), address);
}

/** Resolves current locators before replaying visible migrations from the saved working copy. */
export function resolveForCaller(context: AddressResolutionContext, text: string, reader: Reader): CallerResolution {
  const resolution = resolveWithHistory(context, text, reader);
  let next = resolution.next();
  while (!next.done) next = resolution.next();
  return next.value;
}

/** Resolves locators using their definitions and history from the same pinned publication. */
export async function resolvePublishedForCaller(
  text: string,
  reader: Reader,
  load: (project: string) => Promise<{ documents: readonly { path: string; source: string }[]; records: readonly MigrationRecord[] } | null>,
): Promise<CallerResolution> {
  const projects = new Map<string, NonNullable<Awaited<ReturnType<typeof load>>>>();
  const resolution = resolveWithHistory(
    {
      projectExists: project => projects.has(project),
      readMigrations: project => projects.get(project)?.records ?? [],
      readFile(project, path) {
        const document = projects.get(project)?.documents.find(candidate => candidate.path === path);
        if (!document) throw new NotFoundError('File not found.');
        return document;
      },
    },
    text,
    reader,
  );
  let next = resolution.next();
  while (!next.done) {
    const snapshot = await load(next.value);
    if (snapshot) projects.set(next.value, snapshot);
    next = resolution.next();
  }
  return next.value;
}
