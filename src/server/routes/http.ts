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
function gitFailureResponse(gitError: GitError, context: ErrorContext) {
  if (!context.serverMode) return Response.json({ error: gitError.message }, { status: 500 });
  const output = gitError.result?.stderr.trim();
  log.error('http.git-failed', {
    requestId: context.requestId ?? 'unknown',
    errorMessage: gitError.message,
    gitOutput: output,
  });
  return Response.json({ error: 'Git failed.' }, { status: 500 });
}

/**
 * Maps workspace errors to HTTP responses, including current content for stale saves. In server
 * mode an unexpected error answers 500; local mode keeps 400 with the message, because the
 * person reading it owns the machine.
 */
export function errorResponse(error: unknown, publicUrl?: string, context: ErrorContext = {}) {
  if (error instanceof AdminRefusal) return Response.json(error.body, { status: error.status });
  // Marks the hidden-resource 404 so the access middleware can audit it as a denial; the body
  // stays identical to an ordinary missing error, so the client cannot tell them apart.
  // A case variant of a name could name a file the person may not read on a volume that ignores
  // case, so it answers like a hidden file.
  if (error instanceof HiddenResourceError || error instanceof CaseVariantError) {
    const response = Response.json({ error: 'Not found.' }, { status: 404 });
    hiddenResponses.add(response);
    return response;
  }
  if (error instanceof SignInError) return signInErrorResponse(error, publicUrl);
  if (error instanceof AdminStaleError) return Response.json({ error: 'stale', message: error.message }, { status: 409 });
  if (error instanceof AdminConfigError || error instanceof AccessConfigError) return Response.json({ error: error.message }, { status: 400 });
  if (error instanceof StaleError) return Response.json({ error: 'stale', currentHash: error.currentHash, currentSource: error.currentSource }, { status: 409 });
  if (error instanceof ConnectRequiredError) return Response.json({ error: error.message, connect: error.connect }, { status: 428 });
  if (error instanceof RemoteHostError) return Response.json({ error: error.message, allowedHosts: error.allowedHosts }, { status: 400 });
  if (error instanceof GoneError) return Response.json({ error: error.message }, { status: 410 });
  if (error instanceof OccupiedError) return Response.json({ error: 'occupied', message: error.message, suggestion: error.suggestion }, { status: 409 });
  if (error instanceof ConflictError) return Response.json({ error: 'conflict', message: error.message, conflicts: error.conflicts }, { status: 409 });
  if (error instanceof MergingError) return Response.json({ error: 'merging', message: error.message, conflicts: error.conflicts }, { status: 409 });
  if (error instanceof BranchInUseError) return Response.json({ error: error.message, inUseBy: error.inUseBy }, { status: 409 });
  if (error instanceof PersonalBranchError) return Response.json({ error: error.message, branch: error.branch }, { status: 403 });
  if (error instanceof NotFastForwardError) return Response.json({ error: error.message, notFastForward: true }, { status: 409 });
  if (error instanceof NothingToPublishError) return Response.json({ error: error.message, nothingToPublish: true }, { status: 409 });
  if (error instanceof MissingFolderError) return Response.json({ error: error.message, missingFolder: error.folder }, { status: 409 });
  if (error instanceof NotFoundError) return Response.json({ error: error.message }, { status: 404 });
  if (error instanceof TooLargeError) return Response.json({ error: error.message, limitBytes: error.limitBytes }, { status: 413 });
  if (error instanceof InputError) return Response.json({ error: error.message, issues: error.issues }, { status: 400 });
  if (error instanceof BlockedError) return Response.json({ error: error.reason, message: error.message, paths: error.paths }, { status: 409 });
  if (error instanceof GitError) return gitFailureResponse(error, context);
  if (error instanceof PathError || error instanceof BadRequestError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (context.serverMode) return internalErrorResponse(error, context.requestId);
  return Response.json({ error: (error as Error).message }, { status: 400 });
}
