// Browser client for the compile routes: check, compile, download and convert. Failures carry the HTTP status and the body the server sent.
import type { CheckAnswer, RunAnswer } from '../../server/tessera/compile-service';
import type { ConvertAnswer } from '../../server/tessera/convert-service';
import type { CompileFinding } from '../../shared/tessera/compile-findings';
import { apiFetch } from '../projects/api';

/** Where a check reads from: the published snapshot, or the person's saved working copy. */
export type CompileSource = 'published' | 'working';

/** A request the server refused. The status and the answer's own error name tell the interface what to show. */
export type CompileFailure = Error & { status: number; body: { error?: string; message?: string; current?: string; findings?: CompileFinding[]; report?: unknown } };

/** What the person confirmed in the conversion dialog: the file version and input hashes the review saw, and the digest accepted. */
export type ConvertBody = { path: string; baseHash: string; inputs: { path: string; sha256: string }[]; accept: { digest: string } };

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

async function answerOf<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw failureOf(response, body);
  return body as T;
}

function post(path: string, body: unknown): Promise<Response> {
  return apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

const compilePath = (project: string) => `/api/projects/${encodeURIComponent(project)}/compile`;

/** The calls the compile and conversion dialogs make. A test replaces this object whole. */
export const compileApi = {
  check: (project: string, source: CompileSource) => post(`${compilePath(project)}/check`, { source }).then(response => answerOf<CheckAnswer>(response)),
  run: (project: string, digest: string | undefined, commit: string | undefined) =>
    post(compilePath(project), { ...(digest ? { accept: { digest } } : {}), ...(commit ? { commit } : {}) }).then(response => answerOf<RunAnswer>(response)),
  async download(project: string, digest: string | undefined, commit: string): Promise<BundleDownload> {
    const query = new URLSearchParams({ commit });
    if (digest) query.set('accept', digest);
    const response = await apiFetch(`${compilePath(project)}/bundle?${query}`);
    if (!response.ok) throw failureOf(response, await response.json().catch(() => ({})));
    const disposition = response.headers.get('Content-Disposition') ?? '';
    return { blob: await response.blob(), fileName: /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${project}-standard-ossie.zip` };
  },
  convert: (project: string, body: ConvertBody) => post(`${compilePath(project)}/convert`, body).then(response => answerOf<ConvertAnswer>(response)),
};

/** The shape the dialogs depend on, so a test can pass a fake. */
export type CompileApi = typeof compileApi;
