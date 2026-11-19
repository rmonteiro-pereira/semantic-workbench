// The browser's typed client for the shared proposal routes of one project's repository.
import { apiFetch } from '../projects/api';
import type { PromotionCheck, ProposalSummary, ProposalView } from '../../shared/proposals/proposal';

/** A refusal from a proposal operation, with the stable code the interface words. */
export class ProposalProblem extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ProposalProblem';
  }
}

/** One file as the proposal's base and its tip hold it, for the text comparison. */
export type ProposalFileDiff = { path: string; before: string; after: string; binary: boolean; beforeExists: boolean; afterExists: boolean };

/** What working on a proposal answers: the branch the copy is now on. */
export type WorkResult = { branch: string; head: string | null };

/** What synchronizing answers: merged, or the files left in conflict. */
export type SynchronizeResult = { merged: true; head: string | null } | { merged: false; conflicted: string[] };

const base = (project: string, id?: string) => `/api/projects/${encodeURIComponent(project)}/proposals${id ? `/${encodeURIComponent(id)}` : ''}`;
const post = (body: unknown = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function answer<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (response.ok) return body as T;
  // A refusal carries a code and a sentence; a missing proposal carries only "Not found."
  const code = typeof body.error === 'string' ? body.error : 'failed';
  const fallback = code === 'failed' ? `The request failed (${response.status}).` : code;
  const message = typeof body.message === 'string' ? body.message : fallback;
  throw new ProposalProblem(code, message, response.status);
}

/** Where the person's copy is now, as Source Control reports it. */
async function copyPosition(project: string) {
  const status = await answer<{ branch: string; head?: string | null }>(await apiFetch(`/api/projects/${encodeURIComponent(project)}/git/status`));
  return { expectedBranch: status.branch, expectedHead: status.head ?? '' };
}

/** Proposal operations of one project's repository. */
export const proposals = {
  list: async (project: string) => answer<ProposalSummary[]>(await apiFetch(base(project))),
  read: async (project: string, id: string) => answer<ProposalView>(await apiFetch(base(project, id))),
  diff: async (project: string, id: string, owner: string, path: string) =>
    answer<ProposalFileDiff>(await apiFetch(`${base(project, id)}/diff?project=${encodeURIComponent(owner)}&path=${encodeURIComponent(path)}`)),
  create: async (project: string, name: string, projects: string[]) => answer<ProposalView>(await apiFetch(base(project), post({ name, projects }))),
  work: async (project: string, id: string) => answer<WorkResult>(await apiFetch(`${base(project, id)}/work`, post(await copyPosition(project)))),
  synchronize: async (project: string, id: string) => answer<SynchronizeResult>(await apiFetch(`${base(project, id)}/synchronize`, post(await copyPosition(project)))),
  contribute: async (project: string, id: string, expectedTip: string) => {
    const { expectedHead } = await copyPosition(project);
    return answer<ProposalView>(await apiFetch(`${base(project, id)}/contribute`, post({ expectedTip, branchHead: expectedHead })));
  },
  check: async (project: string, id: string, expectedTip: string) => answer<PromotionCheck>(await apiFetch(`${base(project, id)}/promotion-check?expectedTip=${encodeURIComponent(expectedTip)}`)),
  promote: async (project: string, id: string, expectedTip: string) =>
    answer<{ published: string; previous: string | null; commit: string }>(await apiFetch(`${base(project, id)}/promote`, post({ expectedTip }))),
  close: async (project: string, id: string) => answer<ProposalView>(await apiFetch(`${base(project, id)}/close`, post())),
  restore: async (project: string, id: string) => answer<ProposalView>(await apiFetch(`${base(project, id)}/restore`, post())),
};
