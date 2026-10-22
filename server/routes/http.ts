// Defines shared route handling and HTTP error responses.
import { AdminRefusal } from '../auth/access-admin';
import { SignInError } from '../auth/sign-in-error';
import { signInErrorResponse } from './auth';
import { AdminConfigError, AdminStaleError } from '../auth/admin-repo';
import { AccessConfigError } from '../auth/access-config';
import { ConnectRequiredError } from '../auth/remote-credentials';
import { RemoteHostError } from '../auth/remote-hosts';
import { InputError } from '../../src/diagnostics';
import { PathError } from '../projects/paths';
import { GitError } from '../projects/git';
import { BlockedError } from '../projects/scm';
import type { Workspace } from '../projects/workspace';
import { hiddenResponses } from '../request';
import {
  HiddenResourceError,
  NotFoundError,
  StaleError,
  GoneError,
  OccupiedError,
  ConflictError,
  MergingError,
} from '../projects/errors';
/** Handles a request or returns null so the next route can try it. */
export type Route = (
  ws: Workspace,
  req: Request,
  url: URL,
) => Promise<Response | null> | Response | null;
/** Maps workspace errors to HTTP responses, including current content for stale saves. */
export function errorResponse(e: unknown, publicUrl?: string) {
  if (e instanceof AdminRefusal) return Response.json(e.body, { status: e.status });
  // Marks the hidden-resource 404 so the access middleware can audit it as a denial; the body
  // stays identical to an ordinary missing item, so the client cannot tell them apart.
  if (e instanceof HiddenResourceError) {
    const response = Response.json({ error: 'Not found.' }, { status: 404 });
    hiddenResponses.add(response);
    return response;
  }
  if (e instanceof SignInError) return signInErrorResponse(e, publicUrl);
  if (e instanceof AdminStaleError)
    return Response.json({ error: 'stale', message: e.message }, { status: 409 });
  if (e instanceof AdminConfigError || e instanceof AccessConfigError)
    return Response.json({ error: e.message }, { status: 400 });
  if (e instanceof StaleError)
    return Response.json(
      { error: 'stale', currentHash: e.currentHash, currentSource: e.currentSource },
      { status: 409 },
    );
  if (e instanceof ConnectRequiredError)
    return Response.json({ error: e.message, connect: e.connect }, { status: 428 });
  if (e instanceof RemoteHostError)
    return Response.json({ error: e.message, allowedHosts: e.allowedHosts }, { status: 400 });
  if (e instanceof GoneError) return Response.json({ error: e.message }, { status: 410 });
  if (e instanceof OccupiedError)
    return Response.json(
      { error: 'occupied', message: e.message, suggestion: e.suggestion },
      { status: 409 },
    );
  if (e instanceof ConflictError)
    return Response.json(
      { error: 'conflict', message: e.message, conflicts: e.conflicts },
      { status: 409 },
    );
  if (e instanceof MergingError)
    return Response.json(
      { error: 'merging', message: e.message, conflicts: e.conflicts },
      { status: 409 },
    );
  if (e instanceof NotFoundError) return Response.json({ error: e.message }, { status: 404 });
  if (e instanceof InputError)
    return Response.json({ error: e.message, issues: e.issues }, { status: 400 });
  if (e instanceof BlockedError)
    return Response.json({ error: e.reason, message: e.message, paths: e.paths }, { status: 409 });
  if (e instanceof GitError) return Response.json({ error: e.message }, { status: 500 });
  if (e instanceof PathError) return Response.json({ error: e.message }, { status: 400 });
  return Response.json({ error: (e as Error).message }, { status: 400 });
}
