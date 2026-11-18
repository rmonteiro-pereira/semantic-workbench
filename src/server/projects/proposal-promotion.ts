// Checking and promoting a proposal. Promotion moves the default branch to the proposal's tip through
// the publication path, so it keeps publication's ordering, durable intent, compare-and-swap and
// refresh of every project; this module adds the proposal's own bookkeeping around that one move.
import type { PromotionCheck, PromotionReason, ProposalRecord } from '../../shared/proposals/proposal';
import { GuardedChangeError } from '../auth/guards';
import { BadRequestError, NotFastForwardError, ProposalRefusalError, SnapshotUnreadableError } from './errors';
import { log } from '../observability/log';
import type { Mutation, ProposalCaller, ProposalContext } from './proposal-context';
import type { PublicationResult } from './publication';

/** What the promoter reviewed. */
export type PromotionRequest = { expectedTip: unknown };

const SIZE_LIMIT_WORDS = /limit|too large|exceed/i;

// Maps what the publication checks throw to the closed list of reasons the interface words.
function reasonOf(error: unknown): { reason: PromotionReason; files: string[] } | null {
  if (error instanceof NotFastForwardError) return { reason: 'not-descendant', files: [] };
  if (error instanceof SnapshotUnreadableError) return { reason: SIZE_LIMIT_WORDS.test(error.message) ? 'limit' : 'invalid', files: [] };
  if (error instanceof GuardedChangeError) return { reason: 'guard', files: [...new Set(error.guarded.map(item => item.file))] };
  return null;
}

/** Creates the operations that decide and carry out a promotion. */
export function createPromotions(context: ProposalContext) {
  const { deps } = context;
  const { refs, store } = deps;

  // The files that differ between two commits, with renames split in two, so each path is judged.
  const pathsBetween = (repository: string) => async (previous: string | null, next: string) => {
    if (!previous) return deps.git.changedBetween(deps.worktrees.baseDir(repository), null, next);
    return (await refs.changedPaths(repository, previous, next)).map(change => change.path);
  };

  async function check(slug: string, id: string, request: { expectedTip?: unknown }, caller: ProposalCaller): Promise<PromotionCheck> {
    const { repository, record } = context.find(slug, id, caller);
    const facts = await context.facts(repository, record);
    // Authority over every project of the repository comes first, before any other work.
    if (!caller.authority.allows('check', facts)) return { ok: false, reasons: ['authority'], files: [] };
    let tip: string;
    try {
      tip = await context.openTip(repository, record);
    } catch (error) {
      if (error instanceof ProposalRefusalError) return { ok: false, reasons: ['not-open'], files: [] };
      throw error;
    }
    const reasons: PromotionReason[] = [];
    const known = new Set(deps.projectsIn(repository));
    if (record.projects.some(project => !known.has(project))) reasons.push('missing-project');
    if (typeof request.expectedTip === 'string' && request.expectedTip !== tip) reasons.push('stale-tip');
    const files: string[] = [];
    const published = deps.publishedCommit(repository);
    if (!published) reasons.push('invalid');
    else if (!reasons.length) {
      try {
        await deps.checkCandidate(slug, caller.reader, { previous: published, next: tip, paths: pathsBetween(repository) });
      } catch (error) {
        const mapped = reasonOf(error);
        if (!mapped) throw error;
        reasons.push(mapped.reason);
        files.push(...mapped.files);
      }
    }
    return { ok: reasons.length === 0, reasons, files };
  }

  // Runs inside the repository queue once the default branch has moved: the record and the ref follow it.
  function settle(repository: string, record: ProposalRecord, tip: string, caller: ProposalCaller) {
    return async (result: PublicationResult) => {
      const actor = context.actorOf(caller.reader);
      const outcome = { by: actor.id, at: context.timestamp(), tip, previousPublished: result.previous, published: result.commit };
      const promoted: ProposalRecord = { ...record, status: 'promoted', outcome };
      store.write(
        repository,
        store.read(repository).map(candidate => (candidate.id === record.id ? promoted : candidate)),
      );
      await refs.removeRef(repository, record.id, tip);
    };
  }

  async function promote(slug: string, id: string, request: PromotionRequest, caller: ProposalCaller): Promise<Mutation<PublicationResult>> {
    if (typeof request.expectedTip !== 'string' || !request.expectedTip) throw new BadRequestError('expectedTip is required.');
    const expectedTip = request.expectedTip;
    const { repository, record } = context.find(slug, id, caller);
    caller.authority.check('promote', await context.facts(repository, record));
    const tip = await context.openTip(repository, record);
    if (tip !== expectedTip) throw new ProposalRefusalError('stale-tip', 'Someone changed this proposal after you reviewed it. Review it again.');
    const known = new Set(deps.projectsIn(repository));
    if (record.projects.some(project => !known.has(project))) throw new ProposalRefusalError('missing-project', 'A project this proposal declares is no longer in the repository.');
    let result: PublicationResult;
    try {
      result = await deps.promote(slug, caller.reader, {
        tip,
        paths: pathsBetween(repository),
        before: async () => {
          const current = store.read(repository).find(candidate => candidate.id === id);
          if (!current || (await context.openTip(repository, current)) !== expectedTip)
            throw new ProposalRefusalError('stale-tip', 'Someone changed this proposal after you reviewed it. Review it again.');
        },
        after: settle(repository, record, tip, caller),
      });
    } catch (error) {
      if (error instanceof NotFastForwardError) throw new ProposalRefusalError('not-descendant', 'The published version moved on. Synchronize the proposal with it and review it again.');
      throw error;
    }
    context.notify('promoted', repository, { ...record, status: 'promoted' });
    return { result, audit: context.audit(record, [result.previous ?? '', result.commit].filter(Boolean)) };
  }

  // A close or restore moves both refs atomically, so one ref in the opposite namespace is enough
  // to finish the record. Two refs or no refs leave the record alone for investigation.
  function recoverClosing(record: ProposalRecord, open: string | undefined, closed: string | undefined): ProposalRecord {
    if (record.status === 'open' && !open && closed) {
      return { ...record, status: 'closed', outcome: { by: 'recovery', at: context.timestamp(), tip: closed } };
    }
    if (record.status === 'closed' && !closed && open && open === record.outcome?.tip) {
      const reopened: ProposalRecord = { ...record, status: 'open' };
      delete reopened.outcome;
      return reopened;
    }
    return record;
  }

  /** Finishes proposal bookkeeping left behind by an interrupted ref transaction or publication. */
  async function recover(repositories: string[]) {
    for (const repository of repositories) {
      await deps.serialized(repository, async () => {
        const published = deps.publishedCommit(repository);
        const records = store.read(repository);
        if (!records.length) return;
        const merged = published ? await refs.mergedInto(repository, published) : new Set<string>();
        const tips = await refs.listTips(repository);
        const settled = new Map<string, ProposalRecord>();
        for (const record of records) {
          const tip = tips.open.get(record.id);
          const closedTip = tips.closed.get(record.id);
          const recovered = recoverClosing(record, tip, closedTip);
          if (recovered !== record) settled.set(record.id, recovered);
          else if (record.status !== 'open') continue;
          else if (!tip || closedTip) log.warn('proposals.damaged', { repository, proposal: record.id });
          else if (published && merged.has(record.id) && tip !== record.base) {
            settled.set(record.id, { ...record, status: 'promoted', outcome: { by: 'recovery', at: context.timestamp(), tip, previousPublished: null, published } });
            await refs.removeRef(repository, record.id, tip);
          }
        }
        if (settled.size)
          store.write(
            repository,
            records.map(record => settled.get(record.id) ?? record),
          );
      });
    }
  }

  return { check, promote, recover };
}
