// Adapts the proposal operations to HTTP: parses the request, builds the caller's authority from
// the request's access scope, answers like a missing proposal for one the caller may not see, and
// leaves every decision to the proposal service.
import { GIT_REQUEST_LIMIT, decodeSegment, readJson } from '../request';
import type { HandlerOptions } from '../auth/middleware';
import { authorizeCheckout } from '../auth/git-access';
import { authorizeContributedFiles, authorizeProposal } from '../auth/proposal-access';
import { recordProposal, requestReader } from '../auth/request-scope';
import { WriteAccessError } from '../auth/write-access-error';
import { BadRequestError } from '../projects/errors';
import type { ProposalAuthority, ProposalCaller } from '../projects/proposal-context';
import type { Workspace } from '../projects/workspace';
import type { Route } from './http';

const PROPOSAL_PATH = /^\/api\/projects\/([^/]+)\/proposals(?:\/([^/]+)(?:\/([a-z-]+))?)?$/;

/** The caller's authority for one request: the same decisions every other route makes, behind a small interface. */
function authorityOf(ws: Workspace, request: Request, slug: string): ProposalAuthority {
  const check: ProposalAuthority['check'] = (operation, facts) => authorizeProposal(request, operation, facts);
  return {
    check,
    allows(operation, facts) {
      try {
        check(operation, facts);
        return true;
      } catch (error) {
        if (error instanceof WriteAccessError) return false;
        throw error;
      }
    },
    files: files => authorizeContributedFiles(request, files),
    checkout: branch => authorizeCheckout({ ws, request, slug }, branch),
  };
}

async function jsonBody(request: Request, keys: string[]): Promise<Record<string, unknown>> {
  const body = await readJson(request, GIT_REQUEST_LIMIT);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !keys.includes(key))) {
    throw new BadRequestError(`Expected {${keys.join(', ')}}.`);
  }
  return body as Record<string, unknown>;
}

/** Answers a POST to one proposal: working, synchronizing and contributing. */
async function postToProposal(proposals: Workspace['proposals'], request: Request, target: { slug: string; id: string; action: string | undefined }, caller: ProposalCaller) {
  const { slug, id, action } = target;
  const position = ['expectedBranch', 'expectedHead'];
  if (action === 'work') {
    const body = await jsonBody(request, position);
    const worked = await proposals.work(slug, id, { expectedBranch: body.expectedBranch, expectedHead: body.expectedHead }, caller);
    recordProposal(request, worked.audit);
    return Response.json(worked.result);
  }
  if (action === 'synchronize') {
    const body = await jsonBody(request, position);
    const synchronized = await proposals.synchronize(slug, id, { expectedBranch: body.expectedBranch, expectedHead: body.expectedHead }, caller);
    recordProposal(request, synchronized.audit);
    const { merged, head, conflicted } = synchronized.result;
    return Response.json(merged ? { merged, head } : { merged, conflicted });
  }
  if (action === 'contribute') {
    const body = await jsonBody(request, ['expectedTip', 'branchHead']);
    const contributed = await proposals.contribute(slug, id, { expectedTip: body.expectedTip, branchHead: body.branchHead }, caller);
    recordProposal(request, contributed.audit);
    return Response.json(contributed.result);
  }
  return null;
}

/** Creates the proposal routes; they exist in server mode only. */
export const createProposalRoutes =
  (options: HandlerOptions = {}): Route =>
  async (ws, request, url) => {
    const match = url.pathname.match(PROPOSAL_PATH);
    if (!match || options.mode !== 'server') return null;
    const slug = decodeSegment(match[1]);
    const id = match[2] === undefined ? undefined : decodeSegment(match[2]);
    const action = match[3];
    const caller: ProposalCaller = { reader: requestReader(request), authority: authorityOf(ws, request, slug) };
    const { proposals } = ws;
    if (request.method === 'GET') {
      if (id === undefined) return Response.json(await proposals.list(slug, caller));
      if (action === undefined) return Response.json(await proposals.read(slug, id, caller));
      if (action === 'diff') return Response.json(await proposals.diff(slug, id, { path: url.searchParams.get('path'), project: url.searchParams.get('project') ?? undefined }, caller));
      return null;
    }
    if (request.method === 'POST' && id === undefined) {
      const body = await jsonBody(request, ['name', 'projects']);
      const created = await proposals.create(slug, { name: body.name, projects: body.projects }, caller);
      recordProposal(request, created.audit);
      return Response.json(created.result, { status: 201 });
    }
    if (request.method === 'POST' && id !== undefined) return postToProposal(proposals, request, { slug, id, action }, caller);
    return null;
  };
