// What an Admin controls about agent connections: the registered programs, through the same preview, receipt and one-commit save as every other access document, and the list of all connections with revocation. An Admin never sees a token or a hash.
import { AdminRefusal, type AccessAdmin } from '../auth/access-admin';
import { decodeSegment } from '../request';
import type { ConnectionService } from '../connections/connection-service';
import { parseProgramsFile, programsIssues, type ProgramsFile } from '../connections/programs';
import { actorOf, objectBody } from './admin';
import type { Route } from './http';

const CONNECTIONS_PATH = '/api/admin/connections';
const PROGRAMS_PATH = '/api/admin/programs';
const PROGRAMS_PREVIEW_PATH = '/api/admin/programs/preview';

/** The document of a proposal, refusing it with the field of the first problem named for each issue. */
function proposedPrograms(body: Record<string, unknown>): ProgramsFile {
  const { baseVersion: _version, dryRunId: _receipt, confirmDeleteInUse: _confirm, ...document } = body;
  const parsed = parseProgramsFile(document);
  if (!parsed.ok) throw new AdminRefusal(400, { error: 'Invalid programs.', issues: programsIssues(document) });
  return parsed.file;
}

export function createAdminConnectionRoutes(getAdmin: () => Promise<AccessAdmin>, service: ConnectionService): Route {
  async function readPrograms() {
    const admin = await getAdmin();
    const { files, version } = await admin.repository.snapshot();
    const stored = files['programs.json'] ? JSON.parse(files['programs.json']) : { formatVersion: 1, programs: [] };
    return { ...stored, version };
  }

  async function preview(request: Request) {
    const body = await objectBody(request);
    const proposed = proposedPrograms(body);
    const admin = await getAdmin();
    const review = await admin.dryRun({ formatVersion: 1, programs: proposed.programs });
    return { ...review, programs: service.preview(proposed) };
  }

  async function save(request: Request) {
    const body = await objectBody(request);
    proposedPrograms(body);
    const admin = await getAdmin();
    const saved = await admin.save('programs', body, actorOf(request));
    // The commit is already active, so the connections it no longer allows end now.
    const ended = service.applyProgramChange();
    return { ...saved, ended };
  }

  return async (_workspace, request, url) => {
    if (url.pathname === PROGRAMS_PATH && request.method === 'GET') return Response.json(await readPrograms());
    if (url.pathname === PROGRAMS_PATH && request.method === 'PUT') return Response.json(await save(request));
    if (url.pathname === PROGRAMS_PREVIEW_PATH && request.method === 'POST') return Response.json(await preview(request));
    if (url.pathname === CONNECTIONS_PATH && request.method === 'GET') return Response.json(service.listAll());
    const target = /^\/api\/admin\/connections\/([^/]+)$/.exec(url.pathname);
    if (target && request.method === 'DELETE') {
      const id = decodeSegment(target[1]);
      if (service.ownerOf(id) === undefined) return Response.json({ error: 'Not found.' }, { status: 404 });
      service.end(id, 'revoked-by-admin');
      return Response.json({ ended: true });
    }
    return null;
  };
}
