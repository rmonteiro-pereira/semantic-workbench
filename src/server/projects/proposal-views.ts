// Builds what a reader receives about a proposal: the standing derived from the record and the refs,
// the declared projects they may read, the files changed in those projects, and the actions their
// authority allows. Nothing here writes.
import { contributionBranch } from '../../shared/proposals/contribution-branch';
import { ownerOfPath } from '../../shared/proposals/contribution-scope';
import {
  deriveStatus,
  type DerivedStatus,
  type ProposalChange,
  type ProposalPermissions,
  type ProposalRecord,
  type ProposalSummary,
  type ProposalView,
  type ProposalRefState,
} from '../../shared/proposals/proposal';
import { HiddenResourceError } from './errors';
import { commitOf } from './git';
import type { ProposalCaller, ProposalContext } from './proposal-context';
import type { ProposalAccessInput, ProposalOperation } from '../auth/proposal-access';

/** What the refs of one repository say, read once for every proposal of a listing. */
export type RepositoryRefs = { open: Map<string, string>; closed: Map<string, string>; published: string | null; merged: Set<string> };

/** The ref state of one proposal inside a repository's refs. */
export function refStateOf(record: ProposalRecord, refs: RepositoryRefs): ProposalRefState {
  return { openTip: refs.open.get(record.id) ?? null, closedTip: refs.closed.get(record.id) ?? null, openTipPublished: refs.merged.has(record.id) };
}

/** The tip a reader sees: the live tip of an open or closed proposal, the promoted tip of a promoted one. */
function shownTip(record: ProposalRecord, status: DerivedStatus, state: ProposalRefState) {
  if (status === 'open') return state.openTip;
  if (status === 'closed') return state.closedTip;
  if (status === 'promoted') return record.outcome?.tip ?? state.openTip;
  return null;
}

function lastMovement(record: ProposalRecord) {
  const times = [record.createdAt, record.outcome?.at, ...record.contributors.map(contributor => contributor.at)].filter((time): time is string => Boolean(time));
  return times.sort().at(-1)!;
}

function permissions(status: DerivedStatus, allows: (operation: ProposalOperation) => boolean): ProposalPermissions {
  const open = status === 'open';
  return {
    contribute: open && allows('contribute'),
    promote: open && allows('promote'),
    close: open && allows('close'),
    restore: status === 'closed' && allows('restore'),
  };
}

/** Reads the refs of a repository once: tips, the published commit and which open tips it contains. */
export async function readRepositoryRefs(context: ProposalContext, repository: string): Promise<RepositoryRefs> {
  const { deps } = context;
  const tips = await deps.refs.listTips(repository);
  const published = deps.publishedCommit(repository);
  const merged = published ? await deps.refs.mergedInto(repository, published) : new Set<string>();
  return { ...tips, published, merged };
}

/** The summary of one proposal for one reader, or null when it must stay out of their sight. */
export async function summarizeProposal(context: ProposalContext, caller: ProposalCaller, repository: string, record: ProposalRecord, refs: RepositoryRefs): Promise<ProposalSummary | null> {
  const state = refStateOf(record, refs);
  const status = deriveStatus(record, state);
  const facts: ProposalAccessInput = await context.facts(repository, record);
  const allows = (operation: ProposalOperation) => caller.authority.allows(operation, facts);
  // A damaged proposal is shown only to people who could promote it, so nobody else learns of it.
  if (status === 'damaged' && !allows('promote')) return null;
  return {
    id: record.id,
    name: record.name,
    status,
    createdByName: record.createdByName,
    createdAt: record.createdAt,
    lastMovementAt: lastMovement(record),
    projects: record.projects.filter(slug => context.canRead(caller.reader, slug)).map(slug => ({ slug, name: context.deps.projectName(slug) })),
    tip: shownTip(record, status, state),
    contributors: record.contributors.map(contributor => contributor.name),
    may: permissions(status, allows),
  };
}

/** The changed files of the declared projects the reader may read, grouped by project. */
async function readableChanges(context: ProposalContext, caller: ProposalCaller, repository: string, record: ProposalRecord, tip: string): Promise<ProposalChange[]> {
  const folders = context.folders(repository);
  const grouped = new Map<string, ProposalChange>();
  for (const change of await context.deps.refs.changedPaths(repository, record.base, tip)) {
    const owner = ownerOfPath(folders, change.path);
    if (!owner || !record.projects.includes(owner.project)) continue;
    if (caller.reader.view && !caller.reader.view.canRead(owner.project, owner.path)) continue;
    const group = grouped.get(owner.project) ?? { project: owner.project, files: [] };
    group.files.push({ path: owner.path, status: change.status });
    grouped.set(owner.project, group);
  }
  return [...grouped.values()];
}

/** The reader's own contribution branch for the proposal, and whether it lacks the proposal tip. */
async function myContribution(context: ProposalContext, caller: ProposalCaller, repository: string, record: ProposalRecord, tip: string) {
  const owner = context.deps.ownerOf(caller.reader);
  if (!owner) return null;
  const branch = contributionBranch(owner.handle, record.id);
  const directory = context.deps.worktrees.baseDir(repository);
  const head = await commitOf(context.deps.git, directory, `refs/heads/${branch}`);
  if (!head) return null;
  return { branch, behind: !(await context.deps.git.isAncestor(directory, tip, head)) };
}

/** The full view of one proposal for one reader. */
export async function describeProposal(context: ProposalContext, caller: ProposalCaller, repository: string, record: ProposalRecord, refs: RepositoryRefs): Promise<ProposalView> {
  const summary = await summarizeProposal(context, caller, repository, record, refs);
  if (!summary) throw new HiddenResourceError();
  const tip = summary.tip;
  if (!tip) return { ...summary, behindPublished: 0, changes: [], mine: null };
  const behindPublished = refs.published ? await context.deps.refs.behind(repository, tip, refs.published) : 0;
  const mine = summary.status === 'open' ? await myContribution(context, caller, repository, record, tip) : null;
  return { ...summary, behindPublished, changes: await readableChanges(context, caller, repository, record, tip), mine };
}
