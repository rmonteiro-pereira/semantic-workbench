// Serves check, compile and bundle of a project as standard Ossie, and routes conversion. Answers carry the source label, and refusals come before any byte of a zip.
import { requestReader } from '../auth/request-scope';
import { authorizeWrite } from '../auth/write-access';
import { SnapshotUnavailableError, TooLargeError } from '../projects/errors';
import { zipSize, zipStream, type ZipEntry } from '../projects/zip';
import { FILE_SAVE_REQUEST_LIMIT, decodeSegment, readJson } from '../request';
import { SnapshotChangedError, checkUnit, compilePublished, runCompile, type CompileOutcome } from '../tessera/compile-service';
import { parseBundleQuery, parseCheckRequest, parseConvertRequest, parseRunRequest } from '../tessera/compile-request';
import { ConvertRefusal, convertToStandard } from '../tessera/convert-service';
import { OutputPartError } from '../tessera/output-part';
import { UnitLimitError } from '../tessera/unit-source';
import { workspaceConversion } from '../tessera/workspace-conversion';
import { workspaceUnitSource } from '../tessera/workspace-unit-source';
import type { Workspace } from '../projects/workspace';
import { EXPORT_LIMIT_BYTES } from './export';
import type { Route } from './http';

const COMPILE_ROUTE = /^\/api\/projects\/([^/]+)\/compile(?:\/(check|bundle|convert))?$/;

function convertRefusalResponse(error: ConvertRefusal): Response {
  if (error.code === 'refused') return Response.json({ error: 'refused', message: error.message, findings: error.findings }, { status: 422 });
  return Response.json({ error: error.code, message: error.message }, { status: 409 });
}

/** Maps the refusals of the compile operations to the answers the contract names. Anything else is left to the shared error handling. */
function refusalResponse(error: unknown): Response | null {
  if (error instanceof SnapshotUnavailableError) return Response.json({ error: 'not-published' }, { status: 409 });
  if (error instanceof SnapshotChangedError) return Response.json({ error: 'snapshot-changed', current: error.current }, { status: 409 });
  if (error instanceof ConvertRefusal) return convertRefusalResponse(error);
  if (error instanceof UnitLimitError) return Response.json({ error: error.message }, { status: 413 });
  if (error instanceof OutputPartError) {
    const status = error.reason === 'snapshot-changed' ? 409 : 400;
    return Response.json({ error: error.reason === 'snapshot-changed' ? 'snapshot-changed' : error.message }, { status });
  }
  return null;
}

async function answering(use: () => Promise<Response>): Promise<Response> {
  try {
    return await use();
  } catch (error) {
    const response = refusalResponse(error);
    if (response) return response;
    throw error;
  }
}

async function checkRoute(ws: Workspace, req: Request, slug: string): Promise<Response> {
  const request = parseCheckRequest(await readJson(req, FILE_SAVE_REQUEST_LIMIT));
  return answering(async () => Response.json(await checkUnit(workspaceUnitSource(ws, slug, requestReader(req)), request)));
}

async function runRoute(ws: Workspace, req: Request, slug: string): Promise<Response> {
  const { file, ...request } = parseRunRequest(await readJson(req, FILE_SAVE_REQUEST_LIMIT));
  return answering(async () => Response.json(await runCompile(workspaceUnitSource(ws, slug, requestReader(req)), request, file)));
}

function refusedDownload(outcome: Exclude<CompileOutcome, { result: 'released' }>): Response {
  if (outcome.result === 'refused') return Response.json({ error: 'refused', source: outcome.source, findings: outcome.findings }, { status: 422 });
  return Response.json({ error: 'acceptance-required', source: outcome.source, reason: outcome.reason, report: outcome.report }, { status: 409 });
}

function zipEntries(outcome: Extract<CompileOutcome, { result: 'released' }>): ZipEntry[] {
  return outcome.bundle.map(file => ({ name: file.path, size: file.bytes.length, read: () => file.bytes }));
}

async function convertRoute(ws: Workspace, req: Request, slug: string): Promise<Response> {
  const request = parseConvertRequest(await readJson(req, FILE_SAVE_REQUEST_LIMIT));
  authorizeWrite(req, 'edit', [{ type: 'file', project: slug, path: request.path }]);
  return answering(async () => Response.json(await convertToStandard(workspaceConversion(ws, slug, requestReader(req)), request)));
}

/** Builds the zip download of a released compile, or refuses when it is over the ceiling. Nothing is streamed before this returns. */
export function bundleResponse(outcome: Extract<CompileOutcome, { result: 'released' }>, slug: string, maxBytes: number): Response {
  const entries = zipEntries(outcome);
  const total = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (total > maxBytes) throw new TooLargeError(`This bundle is too large to download: the limit is ${Math.round(maxBytes / 1_000_000)} MB. Nothing was downloaded.`, maxBytes);
  const headers = {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${slug}-standard-ossie.zip"`,
    'Content-Length': String(zipSize(entries)),
    'X-Compile-Commit': outcome.commit,
    'X-Compile-Digest': outcome.report.digest,
    'Cache-Control': 'no-store',
  };
  return new Response(zipStream(entries), { headers });
}

async function bundleRoute(ws: Workspace, req: Request, url: URL, slug: string, maxBytes: number): Promise<Response> {
  const request = parseBundleQuery(url);
  return answering(async () => {
    const outcome = await compilePublished(workspaceUnitSource(ws, slug, requestReader(req)), request);
    if (outcome.result !== 'released') return refusedDownload(outcome);
    return bundleResponse(outcome, slug, maxBytes);
  });
}

/** Builds the compile routes. The size ceiling of a download is a parameter so a test can lower it. */
export function createCompileRoutes(options: { maxBundleBytes: number } = { maxBundleBytes: EXPORT_LIMIT_BYTES }): Route {
  return async (ws, req, url) => {
    const match = url.pathname.match(COMPILE_ROUTE);
    if (!match) return null;
    const slug = decodeSegment(match[1]);
    const operation = match[2] ?? 'run';
    if (operation === 'bundle' && req.method === 'GET') return bundleRoute(ws, req, url, slug, options.maxBundleBytes);
    if (req.method !== 'POST') return null;
    if (operation === 'check') return checkRoute(ws, req, slug);
    if (operation === 'run') return runRoute(ws, req, slug);
    if (operation === 'convert') return convertRoute(ws, req, slug);
    return null;
  };
}

/** Answers the compile routes, or returns null for any other path so the next route can try it. */
export const compileRoutes: Route = createCompileRoutes();
