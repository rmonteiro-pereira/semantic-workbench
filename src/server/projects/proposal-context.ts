// What every proposal operation shares: the services it is built from, the caller's authority, and
// the small lookups that keep one operation's reading of a proposal the same as every other's.
import type { FileChange } from '../../shared/governance/guards';
import type { ProposalAccessInput, ProposalOperation } from '../auth/proposal-access';
import type { ProposalEventKind, ProposalRecord } from '../../shared/proposals/proposal';
import type { ProjectFolder } from '../../shared/proposals/contribution-scope';
import type { EventTags } from './events';
import type { Git } from './git';
import type { PublicationGuard, PublicationResult } from './publication';
import { HiddenResourceError } from './errors';
import type { ProposalRefs } from './proposal-refs';
import type { ProposalStore } from './proposal-store';
import type { Reader } from './reader';
import type { Scm } from './scm';
import type { CopyOwner, Worktrees } from './worktrees';

/** What the caller's access scope decides, supplied by the route so the service stays free of requests. */
export type ProposalAuthority = {
  /** Refuses by throwing when the caller lacks the authority the operation needs. */
  check: (operation: ProposalOperation, facts: ProposalAccessInput) => void;
  /** The same decision as a yes or no, for the actions a view offers. */
  allows: (operation: ProposalOperation, facts: ProposalAccessInput) => boolean;
  /** Refuses when the caller may not edit one of the files a contribution changes. */
  files: (files: { project: string; path: string }[]) => void;
  /** Refuses when the caller may not check out the branch. */
  checkout: (branch: string) => void;
};

/** The person asking, with what they read and what they are allowed to do. */
export type ProposalCaller = { reader: Reader; authority: ProposalAuthority };

/** What a mutating call tells the audit record. */
export type ProposalAudit = { proposal: string; projects: string[]; commits: string[] };

/** The result of a mutating call and the audit facts that go with it. */
export type Mutation<T> = { result: T; audit: ProposalAudit };

/** The move a promotion asks the publication path to make. */
export type PromotionMove = {
  tip: string;
  paths: (previous: string | null, next: string) => Promise<string[]>;
  before: (previous: string | null) => Promise<void>;
  after: (result: PublicationResult) => Promise<void>;
};

/** The services proposals are built from. */
export type ProposalDeps = {
  store: ProposalStore;
  refs: ProposalRefs;
  git: Git;
  worktrees: Worktrees;
  /** What moving a repository between two commits changes, read on the published checkout. */
  changes: (slug: string, base: string | null, tip: string, paths?: string[]) => Promise<FileChange[]>;
  /** Source control of the person's own working copy, created on first use. */
  scmFor: (slug: string, reader: Reader) => Promise<Scm>;
  repositoryOf: (slug: string) => string;
  projectsIn: (repository: string) => string[];
  projectName: (slug: string) => string;
  /** The folder a project occupies inside its repository, `''` at the root. */
  prefixOf: (slug: string) => string;
  /** The working-copy owner a reader is, or null when they have none. */
  ownerOf: (reader: Reader) => CopyOwner | null;
  /** The commit the durable published pointer names for a repository. */
  publishedCommit: (repository: string) => string | null;
  /** Runs the publication checks without moving anything. */
  checkCandidate: (repository: string, branch: string, move: { previous: string | null; next: string }, guard: PublicationGuard) => Promise<void>;
  /** Moves the default branch to the proposal tip through the publication path. */
  promote: (slug: string, reader: Reader, move: PromotionMove) => Promise<PublicationResult>;
  /** Runs one operation inside the repository's serialized queue. */
  serialized: <T>(repository: string, use: () => Promise<T>) => Promise<T>;
  emit: (event: string, data: unknown, tags: EventTags) => void;
  now: () => Date;
};

const mayReadProject = (reader: Reader, project: string) => !reader.view || reader.view.readableProjects.has(project);

/** Whether the reader may read at least one declared project, which is what makes a proposal exist for them. */
export const proposalVisibleTo = (reader: Reader, record: ProposalRecord) => record.projects.some(project => mayReadProject(reader, project));

/** The lookups shared by the proposal operations. */
export function createProposalContext(deps: ProposalDeps) {
  return {
    deps,
    canRead: mayReadProject,
    visibleTo: proposalVisibleTo,
    /** The project folders of a repository, for deciding which project owns a path. */
    folders: (repository: string): ProjectFolder[] => deps.projectsIn(repository).map(slug => ({ slug, prefix: deps.prefixOf(slug) })),
    /** The facts the authority decision needs for an existing proposal. */
    async facts(repository: string, record: ProposalRecord): Promise<ProposalAccessInput> {
      return {
        id: record.id,
        declaredProjects: record.projects,
        repositoryProjects: deps.projectsIn(repository),
        defaultBranch: await deps.worktrees.defaultBranch(repository),
      };
    },
    /** The record a reader may see, or the same refusal as for a proposal that does not exist. */
    find(slug: string, id: string, caller: ProposalCaller) {
      const repository = deps.repositoryOf(slug);
      const record = deps.store.read(repository).find(candidate => candidate.id === id);
      if (!record || !proposalVisibleTo(caller.reader, record)) throw new HiddenResourceError();
      return { repository, record };
    },
    actorOf: (reader: Reader) => ({ id: reader.owner ?? 'local', name: reader.copy?.author.name ?? reader.owner ?? 'local' }),
    timestamp: () => deps.now().toISOString(),
    /** Tells open browsers that readers of the declared projects should look again. */
    notify(kind: ProposalEventKind, repository: string, record: ProposalRecord) {
      deps.emit('proposal', { repository, id: record.id, kind }, { projects: record.projects });
    },
    audit: (record: ProposalRecord, commits: string[]): ProposalAudit => ({ proposal: record.id, projects: record.projects, commits }),
  };
}

/** The shared lookups of one workspace's proposals. */
export type ProposalContext = ReturnType<typeof createProposalContext>;
