/** Records explicit reconciliation through the same write authority as saving the target file. */
import { parseAddress } from '../../shared/core/item-address';
import { requestReader } from '../auth/request-scope';
import { authorizeWrite } from '../auth/write-access';
import { resolveCurrentItem, type AddressReadContext } from './address-resolution';
import { declaredAddressMigrations, operationMigrations, readAddressMigrations, stageAddressMigrations } from './address-migrations';
import { BadRequestError, NotFoundError } from './errors';
import { JournalCrash, type Journal } from './journal';
import type { DataLayout } from './paths';
import type { Reader } from './reader';
import { projectLockKey } from './working-copies';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

/** Supplies the existing workspace lock, journal, reads and local commit lookup. */
export type AddressReconciliationContext = AddressReadContext & {
  layout: DataLayout;
  journal: Journal;
  lock: <T>(key: string, action: () => Promise<T> | T) => Promise<T>;
  head: (project: string, reader: Reader) => Promise<string>;
};

/** Requires a caller-stable operation key so a lost reply can be replayed safely. */
export type ReconciliationRequest = { operationId: string; from: string; to: string };

/** Records an authorized explicit relationship between a missing old locator and a unique current one. */
export async function recordReconciliation(context: AddressReconciliationContext, request: Request, declaration: ReconciliationRequest) {
  const reader = requestReader(request);
  const from = parseAddress(declaration.from);
  const to = parseAddress(declaration.to);
  if (!from.ok || !to.ok || !from.address.project || !to.address.project || !from.address.document || !to.address.document) throw new BadRequestError('Invalid reconciliation locators.');
  const project = to.address.project;
  const path = to.address.document.join('/');
  const previousPath = from.address.document.join('/');
  if (
    reader.view &&
    (!reader.view.readableProjects.has(from.address.project) ||
      !reader.view.readableProjects.has(project) ||
      !reader.view.canRead(from.address.project, previousPath) ||
      !reader.view.canRead(project, path))
  ) {
    throw new NotFoundError('Item not found.');
  }
  authorizeWrite(request, 'edit', [{ type: 'file', project, path }]);
  const [pair] = declaredAddressMigrations([{ kind: 'item', from: declaration.from, to: declaration.to }], project, [previousPath, path]);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(declaration.operationId)) throw new BadRequestError('Invalid reconciliation operation identifier.');
  return context.lock(projectLockKey(project, reader.copy?.key ?? null), async () => {
    const id = `m-${declaration.operationId}-0`;
    const previous = readAddressMigrations(context.layout, project, reader).find(record => record.id === id);
    if (previous) {
      if (previous.kind !== 'reconciliation' || previous.from !== pair.from || previous.to !== pair.to) throw new BadRequestError('A reconciliation operation was replayed with different content.');
      return previous;
    }
    const commit = await context.head(project, reader);
    if (resolveCurrentItem(context, from.address, reader).status !== 'missing') throw new BadRequestError('The old reconciliation locator still resolves.');
    const target = resolveCurrentItem(context, to.address, reader);
    if (target.status !== 'found') throw new BadRequestError('The reconciliation target must resolve uniquely.');
    const guarded = reader.guard?.([{ project, path, before: target.source, after: target.source }]);
    if (guarded?.changes.some(change => change.before !== change.after)) throw new BadRequestError('Reconciliation cannot change guarded source text.');
    const [record] = operationMigrations({ id: declaration.operationId, at: new Date().toISOString(), commit }, [{ kind: 'reconciliation', from: pair.from, to: pair.to }]);
    const staging = join(context.layout.state, `.reconciliation-${declaration.operationId}`);
    try {
      const steps = stageAddressMigrations({ layout: context.layout, project, staging }, [record]);
      context.journal.run('address-reconciliation', steps, [staging], declaration.operationId);
      return record;
    } catch (error) {
      if (!(error instanceof JournalCrash)) rmSync(staging, { recursive: true, force: true });
      throw error;
    }
  });
}
