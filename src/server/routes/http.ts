// Defines shared route handling and HTTP error responses.
import { AdminRefusal } from '../auth/access-admin';
import { SignInError } from '../auth/sign-in-error';
import { signInErrorResponse } from './auth';
import { AdminConfigError, AdminStaleError } from '../auth/admin-repo';
import { AccessConfigError } from '../auth/access-config';
import { ConnectRequiredError } from '../auth/remote-credentials';
import { RemoteHostError } from '../auth/remote-hosts';
import { InputError } from '../../shared/validation/diagnostics';
import { CaseVariantError, PathError } from '../projects/paths';
import { GitError } from '../projects/git';
import { BlockedError } from '../projects/scm';
import type { Workspace } from '../projects/workspace';
import { hiddenResponses, internalErrorResponse } from '../request';
import {
  HiddenResourceError,
  NotFoundError,
  StaleError,
  GoneError,
  MissingFolderError,
  OccupiedError,
  BadRequestError,
  ConflictError,
  MergingError,
  BranchInUseError,
  PersonalBranchError,
  NotFastForwardError,
  NothingToPublishError,
  TooLargeError,
} from '../projects/errors';
import { log } from '../observability/log';
/** Handles a request or returns null so the next route can try it. */
export type Route = (ws: Workspace, req: Request, url: URL) => Promise<Response | null> | Response | null;
/** Where an error happened, which decides how much of it the client may see. */
export type ErrorContext = { serverMode?: boolean; requestId?: string };

/**
 * A failed Git command. Git's own output can name paths and remote addresses, so a server
 * keeps it in the log and tells the client only that Git failed. The failures a person can act
 * on, such as conflicts or a rejected push, have their own error types and keep their answers.
 */
function gitFailureResponse(e: GitError, context: ErrorContext) {
  if (!context.serverMode) return Response.json({ error: e.message }, { status: 500 });
  const output = e.result?.stderr.trim();
  log.error('http.git-failed', {
    requestId: context.requestId ?? 'unknown',
    errorMessage: e.message,
    gitOutput: output,
  });
  return Response.json({ error: 'Git failed.' }, { status: 500 });
}

/**
 * Maps workspace errors to HTTP responses, including current content for stale saves. In server
 * mode an unexpected error answers 500; local mode keeps 400 with the message, because the
 * person reading it owns the machine.
 */
export function errorResponse(e: unknown, publicUrl?: string, context: ErrorContext = {}) {
  if (e instanceof AdminRefusal) return Response.json(e.body, { status: e.status });
  // Marks the hidden-resource 404 so the access middleware can audit it as a denial; the body
  // stays identical to an ordinary missing item, so the client cannot tell them apart.
  // A case variant of a name could name a file the person may not read on a volume that ignores
  // case, so it answers like a hidden file.
  if (e instanceof HiddenResourceError || e instanceof CaseVariantError) {
    const response = Response.json({ error: 'Not found.' }, { status: 404 });
    hiddenResponses.add(response);
    return response;
  }
  if (e instanceof SignInError) return signInErrorResponse(e, publicUrl);
  if (e instanceof AdminStaleError) return Response.json({ error: 'stale', message: e.message }, { status: 409 });
  if (e instanceof AdminConfigError || e instanceof AccessConfigError) return Response.json({ error: e.message }, { status: 400 });
  if (e instanceof StaleError) return Response.json({ error: 'stale', currentHash: e.currentHash, currentSource: e.currentSource }, { status: 409 });
  if (e instanceof ConnectRequiredError) return Response.json({ error: e.message, connect: e.connect }, { status: 428 });
  if (e instanceof RemoteHostError) return Response.json({ error: e.message, allowedHosts: e.allowedHosts }, { status: 400 });
  if (e instanceof GoneError) return Response.json({ error: e.message }, { status: 410 });
  if (e instanceof OccupiedError) return Response.json({ error: 'occupied', message: e.message, suggestion: e.suggestion }, { status: 409 });
  if (e instanceof ConflictError) return Response.json({ error: 'conflict', message: e.message, conflicts: e.conflicts }, { status: 409 });
  if (e instanceof MergingError) return Response.json({ error: 'merging', message: e.message, conflicts: e.conflicts }, { status: 409 });
  if (e instanceof BranchInUseError) return Response.json({ error: e.message, inUseBy: e.inUseBy }, { status: 409 });
  if (e instanceof PersonalBranchError) return Response.json({ error: e.message, branch: e.branch }, { status: 403 });
  if (e instanceof NotFastForwardError) return Response.json({ error: e.message, notFastForward: true }, { status: 409 });
  if (e instanceof NothingToPublishError) return Response.json({ error: e.message, nothingToPublish: true }, { status: 409 });
  if (e instanceof MissingFolderError) return Response.json({ error: e.message, missingFolder: e.folder }, { status: 409 });
  if (e instanceof NotFoundError) return Response.json({ error: e.message }, { status: 404 });
  if (e instanceof TooLargeError) return Response.json({ error: e.message, limitBytes: e.limitBytes }, { status: 413 });
  if (e instanceof InputError) return Response.json({ error: e.message, issues: e.issues }, { status: 400 });
  if (e instanceof BlockedError) return Response.json({ error: e.reason, message: e.message, paths: e.paths }, { status: 409 });
  if (e instanceof GitError) return gitFailureResponse(e, context);
  if (e instanceof PathError || e instanceof BadRequestError) {
    return Response.json({ error: e.message }, { status: 400 });
  }
  if (context.serverMode) return internalErrorResponse(e, context.requestId);
  return Response.json({ error: (e as Error).message }, { status: 400 });
}
