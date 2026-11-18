// Closing a proposal and bringing it back. Closing moves its tip to the closed namespace and keeps
// the record with who closed it; nothing is ever erased, so every commit stays reachable.
import { MAX_OPEN_PROPOSALS, type ProposalRecord, type ProposalView } from '../../shared/proposals/proposal';
import { ProposalRefusalError } from './errors';
import type { Mutation, ProposalCaller, ProposalContext } from './proposal-context';
import { describeProposal, readRepositoryRefs } from './proposal-views';

const sameName = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();

/** Creates the operations that close and restore proposals. */
export function createClosing(context: ProposalContext) {
  const { deps } = context;
  const { refs, store } = deps;

  const replace = (repository: string, updated: ProposalRecord) =>
    store.write(
      repository,
      store.read(repository).map(candidate => (candidate.id === updated.id ? updated : candidate)),
    );

  async function close(slug: string, id: string, caller: ProposalCaller): Promise<Mutation<ProposalView>> {
    const { repository, record } = context.find(slug, id, caller);
    caller.authority.check('close', await context.facts(repository, record));
    return deps.serialized(repository, async () => {
      const current = store.read(repository).find(candidate => candidate.id === id)!;
      const tip = await context.openTip(repository, current);
      if (!(await refs.closeRef(repository, id, tip))) throw new ProposalRefusalError('stale-tip', 'Someone changed this proposal while you were closing it. Review it again.');
      const actor = context.actorOf(caller.reader);
      const closed: ProposalRecord = { ...current, status: 'closed', outcome: { by: actor.id, at: context.timestamp(), tip } };
      replace(repository, closed);
      context.notify('closed', repository, closed);
      const view = await describeProposal(context, caller, repository, closed, await readRepositoryRefs(context, repository));
      return { result: view, audit: context.audit(closed, [tip]) };
    });
  }

  // The reasons a closed proposal cannot be reopened now, checked against the repository as it is.
  function assertCanReopen(repository: string, record: ProposalRecord, records: ProposalRecord[]) {
    if (record.status !== 'closed') throw new ProposalRefusalError('not-closed', 'This proposal is not closed.');
    const open = records.filter(candidate => candidate.status === 'open');
    if (open.length >= MAX_OPEN_PROPOSALS) throw new ProposalRefusalError('limit', `A repository holds at most ${MAX_OPEN_PROPOSALS} open proposals. Close or promote one first.`);
    if (open.some(candidate => sameName(candidate.name, record.name))) throw new ProposalRefusalError('name-taken', 'An open proposal already has this name. Rename or close it first.');
    const known = new Set(deps.projectsIn(repository));
    if (record.projects.some(project => !known.has(project))) throw new ProposalRefusalError('missing-project', 'A project this proposal declares is no longer in the repository.');
  }

  async function restore(slug: string, id: string, caller: ProposalCaller): Promise<Mutation<ProposalView>> {
    const { repository, record } = context.find(slug, id, caller);
    caller.authority.check('restore', await context.facts(repository, record));
    return deps.serialized(repository, async () => {
      const records = store.read(repository);
      const current = records.find(candidate => candidate.id === id)!;
      assertCanReopen(repository, current, records);
      const tip = await refs.readTip(repository, id, 'closed');
      if (!tip) throw new ProposalRefusalError('damaged', 'This proposal is damaged: its closed Git reference is missing. Ask an Admin to check it.');
      if (!(await refs.restoreRef(repository, id, tip))) throw new ProposalRefusalError('damaged', 'This proposal changed while you were restoring it. Review it again.');
      const reopened: ProposalRecord = { ...current, status: 'open', outcome: undefined };
      delete reopened.outcome;
      replace(repository, reopened);
      context.notify('restored', repository, reopened);
      const view = await describeProposal(context, caller, repository, reopened, await readRepositoryRefs(context, repository));
      return { result: view, audit: context.audit(reopened, [tip]) };
    });
  }

  return { close, restore };
}
