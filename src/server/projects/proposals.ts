// The proposal service of one workspace: it creates, lists and reads proposals, and composes the
// operations that contribute to, promote, close and restore them. Every change runs inside the
// repository's serialized queue, so two operations on one repository never interleave.
import { deriveId, MAX_OPEN_PROPOSALS, ProposalInputError, validateName, type ProposalRecord, type ProposalSummary, type ProposalView } from '../../shared/proposals/proposal';
import { BadRequestError, HiddenResourceError, ProposalRefusalError } from './errors';
import { createProposalContext, type Mutation, type ProposalCaller, type ProposalDeps } from './proposal-context';
import { createContributions } from './proposal-contribution';
import { createClosing } from './proposal-closing';
import { createPromotions } from './proposal-promotion';
import { describeProposal, readRepositoryRefs, summarizeProposal } from './proposal-views';
import { asText } from './scm-context';
import { projectPath } from './paths';

/** The request to create a proposal: a name and the projects it may change. */
export type CreateProposalRequest = { name: unknown; projects: unknown };

function declaredProjects(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.some(slug => typeof slug !== 'string')) {
    throw new BadRequestError('Choose at least one project this proposal may change.');
  }
  return [...new Set(value as string[])];
}

/** Creates the proposal service from the workspace's own services. */
export function createProposals(deps: ProposalDeps) {
  const context = createProposalContext(deps);
  const { store, refs, git, worktrees } = deps;

  async function nameChecked(request: CreateProposalRequest) {
    try {
      return validateName(request.name);
    } catch (error) {
      if (error instanceof ProposalInputError) throw new BadRequestError(error.message);
      throw error;
    }
  }

  // The same refusal for a project that does not exist and one the creator may not read.
  function declaredInRepository(repository: string, caller: ProposalCaller, request: CreateProposalRequest) {
    const declared = declaredProjects(request.projects);
    const inRepository = new Set(deps.projectsIn(repository));
    const usable = declared.every(project => inRepository.has(project) && context.canRead(caller.reader, project));
    if (!usable || !declared.length) throw new BadRequestError('Choose projects of this repository that you can read.');
    return declared;
  }

  async function create(slug: string, request: CreateProposalRequest, caller: ProposalCaller): Promise<Mutation<ProposalView>> {
    const repository = deps.repositoryOf(slug);
    const name = await nameChecked(request);
    const declared = declaredInRepository(repository, caller, request);
    const records = store.read(repository);
    const tips = await refs.listTips(repository);
    const taken = new Set([...records.map(record => record.id), ...tips.open.keys(), ...tips.closed.keys()]);
    const id = deriveId(name, taken);
    const facts = { id, declaredProjects: declared, repositoryProjects: deps.projectsIn(repository), defaultBranch: await worktrees.defaultBranch(repository) };
    caller.authority.check('create', facts);
    return deps.serialized(repository, async () => {
      const base = deps.publishedCommit(repository);
      if (!base) throw new ProposalRefusalError('no-published-commit', 'This repository has no published commit yet, so a proposal has nothing to start from.');
      const current = store.read(repository);
      if (current.filter(record => record.status === 'open').length >= MAX_OPEN_PROPOSALS) {
        throw new ProposalRefusalError('limit', `A repository holds at most ${MAX_OPEN_PROPOSALS} open proposals. Close or promote one first.`);
      }
      // The ref is written before the record, so a stop in between leaves an unregistered ref that nobody sees.
      if (!(await refs.createRef(repository, id, base))) throw new ProposalRefusalError('name-taken', 'Another proposal took this identifier a moment ago. Try again.');
      const actor = context.actorOf(caller.reader);
      const record: ProposalRecord = { id, name, projects: declared, base, createdBy: actor.id, createdByName: actor.name, createdAt: context.timestamp(), status: 'open', contributors: [] };
      store.write(repository, [...current, record]);
      context.notify('created', repository, record);
      const view = await describeProposal(context, caller, repository, record, await readRepositoryRefs(context, repository));
      return { result: view, audit: context.audit(record, [base]) };
    });
  }

  async function list(slug: string, caller: ProposalCaller): Promise<ProposalSummary[]> {
    const repository = deps.repositoryOf(slug);
    const refsOfRepository = await readRepositoryRefs(context, repository);
    const summaries: ProposalSummary[] = [];
    for (const record of store.read(repository)) {
      if (!context.visibleTo(caller.reader, record)) continue;
      const summary = await summarizeProposal(context, caller, repository, record, refsOfRepository);
      if (summary) summaries.push(summary);
    }
    return summaries;
  }

  async function read(slug: string, id: string, caller: ProposalCaller): Promise<ProposalView> {
    const { repository, record } = context.find(slug, id, caller);
    return describeProposal(context, caller, repository, record, await readRepositoryRefs(context, repository));
  }

  // The file as the proposal started and as it stands, for one file the reader may read.
  async function diff(slug: string, id: string, request: { path: unknown; project?: unknown }, caller: ProposalCaller) {
    const { repository, record } = context.find(slug, id, caller);
    const project = typeof request.project === 'string' ? request.project : slug;
    if (typeof request.path !== 'string' || !request.path) throw new BadRequestError('path is required.');
    const path = projectPath(request.path);
    const unreadable = !record.projects.includes(project) || !context.canRead(caller.reader, project) || (caller.reader.view && !caller.reader.view.canRead(project, path));
    if (unreadable) throw new HiddenResourceError();
    const state = await readRepositoryRefs(context, repository);
    const tip = state.open.get(id) ?? state.closed.get(id) ?? record.outcome?.tip;
    if (!tip) throw new HiddenResourceError();
    const directory = worktrees.baseDir(repository);
    const repositoryPath = deps.prefixOf(project) + path;
    const [beforeBytes, afterBytes] = await Promise.all([git.blob(directory, record.base, repositoryPath), git.blob(directory, tip, repositoryPath)]);
    const before = asText(beforeBytes);
    const after = asText(afterBytes);
    return { path, from: record.base, to: tip, before: before.text, after: after.text, binary: before.binary || after.binary, beforeExists: !!beforeBytes, afterExists: !!afterBytes };
  }

  return { create, list, read, diff, ...createContributions(context), ...createPromotions(context), ...createClosing(context), context };
}

/** The proposal service of one workspace. */
export type Proposals = ReturnType<typeof createProposals>;
