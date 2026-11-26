// Browser client for the compile routes: check, compile, download and convert. Failures carry the HTTP status and the body the server sent.
import type { CheckAnswer, RunAnswer } from '../../server/tessera/compile-service';
import type { BaseConvertAnswer, ConvertAnswer } from '../../server/tessera/convert-service';
import type { CompileFinding } from '../../shared/tessera/compile-findings';
import { apiFetch } from '../projects/api';

/** Where a check reads from: the published snapshot, or the person's saved working copy. */
export type CompileSource = 'published' | 'working';

/** A request the server refused. The status and the answer's own error name tell the interface what to show. */
export type CompileFailure = Error & { status: number; body: { error?: string; message?: string; current?: string; findings?: CompileFinding[]; report?: unknown } };

/** What the person confirmed in the conversion dialog: the file version and input hashes the review saw, and the digest accepted. */
export type ConvertBody = { path: string; baseHash: string; inputs: { path: string; sha256: string }[]; accept: { digest: string } };
/** A confirmed base conversion: the file, the version the preview read, and the hash of the converted text it showed. */
export type BaseConvertBody = { path: string; baseHash: string; target: 'ossie-0.3.0.dev0'; converted: string };

/** A downloaded bundle: the zip and the name the server gave it. */
export type BundleDownload = { blob: Blob; fileName: string };

/** Tells a refusal from the server from any other error. */
export function isCompileFailure(error: unknown): error is CompileFailure {
  return error instanceof Error && typeof (error as CompileFailure).status === 'number';
}

function failureOf(response: Response, body: CompileFailure['body']): CompileFailure {
  const message = body.error ?? `Request failed (${response.status}).`;
  return Object.assign(new Error(message), { status: response.status, body });
}

async function answerOf<T>(response: Response, valid: (body: T) => boolean): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw failureOf(response, body);
  if (response.status !== 200 || !body || typeof body !== 'object' || !valid(body as T)) throw new Error('The server returned an invalid compile acknowledgement.');
  return body as T;
}

const HASH = /^[0-9a-f]{64}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

function validSource(source: CheckAnswer['source']): boolean {
  if (source?.kind === 'published-snapshot') return typeof source.commit === 'string' && COMMIT.test(source.commit);
  return source?.kind === 'working-copy' && source.unpublished === true;
}

function validReport(report: CheckAnswer['report']): boolean {
  return Boolean(
    report &&
    report.reportVersion === 2 &&
    typeof report.digest === 'string' &&
    DIGEST.test(report.digest) &&
    Array.isArray(report.inputs) &&
    report.inputs.every(input => typeof input.path === 'string' && input.path.length > 0 && typeof input.sha256 === 'string' && HASH.test(input.sha256)) &&
    Array.isArray(report.losses) &&
    report.losses.every(loss => ['document', 'item', 'property', 'pointer'].every(key => typeof loss[key as keyof typeof loss] === 'string') && typeof loss.bytes === 'number') &&
    report.counts &&
    typeof report.counts === 'object' &&
    Object.values(report.counts).every(count => typeof count === 'number') &&
    typeof report.base?.label === 'string' &&
    report.base.label.length > 0,
  );
}

function validFindings(findings: CompileFinding[]): boolean {
  return Array.isArray(findings) && findings.every(finding => typeof finding.message === 'string' && typeof finding.path === 'string' && ['error', 'warning'].includes(finding.severity));
}

function validCheck(answer: CheckAnswer): boolean {
  return (
    ['ok', 'loss', 'refused'].includes(answer.result) &&
    validSource(answer.source) &&
    validReport(answer.report) &&
    validFindings(answer.findings) &&
    typeof answer.accepted === 'boolean' &&
    typeof answer.base?.label === 'string' &&
    Array.isArray(answer.files) &&
    answer.files.every(
      file => typeof file.path === 'string' && file.path.length > 0 && typeof file.sha256 === 'string' && HASH.test(file.sha256) && ['compiled', 'copied', 'not-included'].includes(file.treatment),
    )
  );
}

function validRun(answer: RunAnswer): boolean {
  if (!validSource(answer.source) || answer.source.kind !== 'published-snapshot') return false;
  if (answer.result === 'refused') return validFindings(answer.findings);
  if (answer.result === 'loss-needs-acceptance') return validReport(answer.report);
  if (answer.result !== 'released' || !validReport(answer.report)) return false;
  return (
    (answer.manifest?.manifestVersion === 1 || answer.manifest?.manifestVersion === 2) &&
    answer.manifest.source?.commit === answer.source.commit &&
    answer.manifest.loss?.digest === answer.report.digest &&
    ['none', 'digest', 'policy'].includes(answer.manifest.loss.accepted) &&
    Array.isArray(answer.files) &&
    answer.files.every(file => typeof file.path === 'string' && file.path.length > 0 && typeof file.sha256 === 'string' && HASH.test(file.sha256) && Number.isInteger(file.bytes) && file.bytes >= 0)
  );
}

function validConversion(answer: ConvertAnswer, request: ConvertBody): boolean {
  return answer.path === request.path && typeof answer.version === 'string' && HASH.test(answer.version) && answer.lossDigest === request.accept.digest;
}

function validBaseConversion(answer: BaseConvertAnswer, request: BaseConvertBody): boolean {
  return answer.path === request.path && typeof answer.version === 'string' && HASH.test(answer.version) && answer.converted === request.converted;
}

function post(path: string, body: unknown): Promise<Response> {
  return apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

const compilePath = (project: string) => `/api/projects/${encodeURIComponent(project)}/compile`;

/** The calls the compile and conversion dialogs make. A test replaces this object whole. */
export const compileApi = {
  check: (project: string, source: CompileSource) =>
    post(`${compilePath(project)}/check`, { source }).then(response =>
      answerOf<CheckAnswer>(response, answer => validCheck(answer) && answer.source.kind === (source === 'working' ? 'working-copy' : 'published-snapshot')),
    ),
  run: (project: string, digest: string | undefined, commit: string | undefined) =>
    post(compilePath(project), { ...(digest ? { accept: { digest } } : {}), ...(commit ? { commit } : {}) }).then(response =>
      answerOf<RunAnswer>(response, answer => validRun(answer) && (!commit || (answer.source.kind === 'published-snapshot' && answer.source.commit === commit))),
    ),
  async download(project: string, digest: string | undefined, commit: string): Promise<BundleDownload> {
    const query = new URLSearchParams({ commit });
    if (digest) query.set('accept', digest);
    const response = await apiFetch(`${compilePath(project)}/bundle?${query}`);
    if (!response.ok) throw failureOf(response, await response.json().catch(() => ({})));
    if (
      response.status !== 200 ||
      !response.headers.get('Content-Type')?.startsWith('application/zip') ||
      response.headers.get('X-Compile-Commit') !== commit ||
      (digest !== undefined && response.headers.get('X-Compile-Digest') !== digest)
    ) {
      throw new Error('The server returned an invalid compile download.');
    }
    const disposition = response.headers.get('Content-Disposition') ?? '';
    return { blob: await response.blob(), fileName: /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${project}-standard-ossie.zip` };
  },
  convert: (project: string, body: ConvertBody) => post(`${compilePath(project)}/convert`, body).then(response => answerOf<ConvertAnswer>(response, answer => validConversion(answer, body))),
  convertBase: (project: string, body: BaseConvertBody) =>
    post(`${compilePath(project)}/convert`, body).then(response => answerOf<BaseConvertAnswer>(response, answer => validBaseConversion(answer, body))),
};

/** The shape the dialogs depend on, so a test can pass a fake. */
export type CompileApi = typeof compileApi;
