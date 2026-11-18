import { spawnSync } from 'node:child_process';
import { migrateAddress, deletesAddress, type MigrationRecord } from '../../shared/core/address-migration';
import { documentAddress, formatAddress } from '../../shared/core/item-address';
import { addressesOfModel } from '../../shared/core/model-addresses';
import { MAX_INPUT_BYTES } from '../../shared/validation/diagnostics';
import { committedFileEdits, completeCommittedEdits } from '../projects/address-commit';
import { ADDRESS_MIGRATION_LIMIT, loadAddressJournal, type JournalMigration } from '../projects/address-migrations';
import { decode, sha256 } from '../projects/atomic';
import { gitEnv, parseBlobBatch } from '../projects/git';
import { projectPrefix, repoDir, type DataLayout } from '../projects/paths';
import { serializationOf } from '../projects/scanner';
import { modelsOfDocuments } from './usage-items';

type Change = { path: string; from: string | null; to: string | null };
type CommitEdits = { commit: string; parents: string[]; changes: Change[] };
type History = { commit: string; records: MigrationRecord[] };
const cached = new WeakMap<DataLayout, Map<string, History[]>>();
const MAX_HISTORY_BYTES = 64 * 1024 * 1024;
const objectId = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

function gitObjects(directory: string, args: string[], input?: string): Buffer {
  const result = spawnSync('git', ['--no-replace-objects', ...args], {
    cwd: directory,
    env: { ...gitEnv(), GIT_NO_LAZY_FETCH: '1' },
    input,
    timeout: 5000,
    maxBuffer: MAX_HISTORY_BYTES,
  });
  if (result.error || result.status !== 0) throw new Error('Published address history could not be read.');
  return result.stdout;
}

function parseEdits(raw: Buffer, prefix: string): CommitEdits[] {
  const tokens = raw.toString('utf8').split('\0');
  const commits: CommitEdits[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index].replace(/^\n/, '');
    if (!token) continue;
    if (token.startsWith('\x1e')) {
      const commit = token.slice(1);
      const parents = tokens[++index].split(' ').filter(Boolean);
      if (!objectId.test(commit) || parents.some(parent => !objectId.test(parent))) throw new Error('Invalid published history commit.');
      commits.push({ commit, parents, changes: [] });
      continue;
    }
    const path = tokens[++index].slice(prefix.length);
    const format = serializationOf(path);
    if (format !== 'yaml' && format !== 'json') continue;
    const [fromMode, toMode, from, to] = token.slice(1).split(' ');
    const change = { path, from: fromMode.startsWith('100') ? from : null, to: toMode.startsWith('100') ? to : null };
    if (change.from || change.to) commits.at(-1)!.changes.push(change);
  }
  return commits;
}

function readEdits(directory: string, prefix: string, commit: string, previous?: string) {
  const range = previous ? previous + '..' + commit : commit;
  const raw = gitObjects(directory, [
    'log',
    '--first-parent',
    '--full-history',
    '--diff-merges=first-parent',
    '--raw',
    '-z',
    '--no-renames',
    '--no-abbrev',
    '--format=%x1e%H%x00%P',
    range,
    '--',
    prefix || '.',
  ]);
  return parseEdits(raw, prefix).reverse();
}

function readBlobs(directory: string, edits: readonly CommitEdits[]) {
  const changed = edits.filter(edit => edit.changes.some(change => change.from));
  const ids = [...new Set(changed.flatMap(edit => edit.changes.flatMap(change => [change.from, change.to])).filter((id): id is string => !!id))];
  if (!ids.length) return new Map<string, Uint8Array>();
  if (ids.some(id => !objectId.test(id))) throw new Error('Invalid published history blob.');
  const input = ids.join('\n') + '\n';
  const sizes = gitObjects(directory, ['cat-file', '--batch-check=%(objecttype) %(objectsize)'], input).toString().trim().split('\n');
  let bytes = 0;
  if (sizes.length !== ids.length) throw new Error('Incomplete published history blobs.');
  for (const size of sizes) {
    const match = /^blob (\d+)$/.exec(size);
    if (!match || Number(match[1]) > MAX_INPUT_BYTES) throw new Error('A published definition exceeds the history limit.');
    bytes += Number(match[1]) + 100;
  }
  if (bytes > MAX_HISTORY_BYTES) throw new Error('Published definition history exceeds the history limit.');
  return parseBlobBatch(gitObjects(directory, ['cat-file', '--batch'], input), ids);
}

function addresses(project: string, changes: readonly Change[], blobs: ReadonlyMap<string, Uint8Array>, side: 'from' | 'to') {
  const documents = changes.flatMap(change => {
    const id = change[side];
    if (!id) return [];
    return [{ id: project + '/' + change.path, filename: change.path, source: decode(blobs.get(id)!), revision: 0, project }];
  });
  const models = modelsOfDocuments(documents);
  return documents.flatMap(document => {
    const model = models.get(document.id);
    if (!model) return [];
    const location = { project, document: document.filename.split('/') };
    return addressesOfModel(model, location)
      .filter(item => !item.ambiguous && !item.volatile)
      .map(item => item.address);
  });
}

function deletions(project: string, edit: CommitEdits, records: readonly MigrationRecord[], blobs: ReadonlyMap<string, Uint8Array>): MigrationRecord[] {
  if (!edit.changes.some(change => change.from)) return [];
  const after = new Set(addresses(project, edit.changes, blobs, 'to').map(formatAddress));
  const movedDocuments = new Set(records.filter(record => record.kind === 'document').map(record => record.from));
  const removed = new Set(
    edit.changes
      .filter(change => change.from && !change.to)
      .map(change => documentAddress(project, change.path))
      .filter(address => !movedDocuments.has(address)),
  );
  for (let address of addresses(project, edit.changes, blobs, 'from')) {
    for (const record of records) {
      if (deletesAddress(record, address)) break;
      address = migrateAddress(address, [record], false);
    }
    const locator = formatAddress(address);
    if (after.has(locator)) continue;
    const sharesRemovedPrefix = address.chain.some((_, index) => removed.has(formatAddress({ ...address, chain: address.chain.slice(0, index) })));
    if (!sharesRemovedPrefix) removed.add(locator);
  }
  return [...removed].map(from => ({ id: `published-delete:${edit.commit}:${sha256(from)}`, kind: 'deleted', from, at: '', commit: edit.commit }));
}

function mergeRecords(directory: string, edit: CommitEdits, bound: ReadonlyMap<string, JournalMigration[]>, blobs: ReadonlyMap<string, Uint8Array>) {
  if (edit.parents.length < 2 || !edit.changes.some(change => change.from) || !bound.size) return [];
  const side = gitObjects(directory, ['rev-list', '--reverse', '--topo-order', edit.commit, '^' + edit.parents[0]])
    .toString()
    .trim()
    .split('\n');
  const candidates = side.filter(commit => commit !== edit.commit).flatMap(commit => bound.get(commit) ?? []);
  if (!candidates.length) return [];
  const matches = edit.changes.map(({ path, from, to }) => committedFileEdits(path, from ? blobs.get(from)! : null, to ? blobs.get(to)! : null, candidates));
  return completeCommittedEdits(candidates, matches);
}

function historyAt(layout: DataLayout, project: string, commit: string, previous?: History): MigrationRecord[] {
  const directory = repoDir(layout, project);
  const prefix = projectPrefix(layout, project);
  let edits = readEdits(directory, prefix, commit, previous?.commit);
  if (previous && edits[0]?.parents[0] !== previous.commit) {
    previous = undefined;
    edits = readEdits(directory, prefix, commit);
  }
  const bound = new Map<string, JournalMigration[]>();
  for (const record of loadAddressJournal(layout, project)) {
    if (!record.committedAt) continue;
    const records = bound.get(record.committedAt) ?? [];
    records.push(record);
    bound.set(record.committedAt, records);
  }
  const blobs = readBlobs(directory, edits);
  const records = [...(previous?.records ?? [])];
  for (const edit of edits) {
    const committed = [...mergeRecords(directory, edit, bound, blobs), ...(bound.get(edit.commit) ?? [])];
    const declarations = committed.map(({ saved: _saved, committedAt, ...record }) => ({ ...record, id: 'published:' + record.id, commit: committedAt! }));
    for (const record of declarations) records.push(record);
    for (const record of deletions(project, edit, declarations, blobs)) records.push(record);
    if (records.length > ADDRESS_MIGRATION_LIMIT) throw new Error('Published address history exceeds the record limit.');
  }
  return records;
}

/** Returns the ordered committed address transitions of the pinned published side. */
export function publishedMigrationRecords(layout: DataLayout, project: string, commit: string | null | undefined): MigrationRecord[] | null {
  if (!commit) return [];
  if (!objectId.test(commit)) return null;
  const projects = cached.get(layout) ?? new Map<string, History[]>();
  cached.set(layout, projects);
  const recent = projects.get(project) ?? [];
  const known = recent.find(entry => entry.commit === commit);
  if (known) return known.records;
  try {
    const records = historyAt(layout, project, commit, recent[0]);
    projects.set(project, [{ commit, records }, ...recent].slice(0, 3));
    return records;
  } catch {
    return null;
  }
}
