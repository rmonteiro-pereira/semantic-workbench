// Reading and writing a text file for the agent. Every step goes through the operation boundary as the panel caller; this module never reads a project file itself.
import { buildTwinRequest } from '../auth/twin-request';
import { BadRequestError } from '../projects/errors';
import type { ChangeCard, RefusalReason } from './panel-events';
import { parseVirtualPath } from './virtual-path';
import type { VersionRecords } from './version-records';

/** Largest text, in bytes, the agent may read or write. It is the document limit of the workbench. */
export const MAXIMUM_FILE_TEXT_BYTES = 2_000_000;
const MAXIMUM_FINDINGS_REPORTED = 50;
const MAXIMUM_FINDING_CHARACTERS = 400;

/** Why a request failed, as far as the agent is told. */
export type FailureReason = RefusalReason | 'too-large' | 'not-text' | 'internal';
/** A failed request: a plain sentence for the agent and, for a refused write, the card the panel shows. */
export type FileFailure = { reason: FailureReason; message: string; card?: ChangeCard };
export type ReadOutcome = { ok: true; content: string } | { ok: false; failure: FileFailure };
/** A write that was applied carries its card, except a repeat of text already stored, which carries none. */
export type WriteOutcome = { ok: true; card?: ChangeCard } | { ok: false; failure: FileFailure };

/** What the requests need: the boundary as one caller, the session's version records and the call limit. */
export type FileRequestDependencies = {
  operate: (request: Request) => Promise<Response>;
  versions: VersionRecords;
  admit: () => { ok: true; release(): void } | { ok: false };
};

type FileAnswer = { hash: string; source: string };
type SaveAnswer = { hash: string; source?: string; demoted?: unknown };

const SENTENCES: Record<FailureReason, string> = {
  'not-available': 'The file does not exist or is not available to you.',
  'too-large': 'The text is larger than the workbench accepts.',
  'not-text': 'The file is not text.',
  'rate-limited': 'Too many requests. Try again later.',
  unread: 'Read the file first, then write it.',
  changed: 'The file changed since it was read. Read it again.',
  invalid: 'The text is not valid.',
  guard: 'A rule of this project refused the change.',
  internal: 'The workbench could not complete this request.',
};

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(await response.text());
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function findingsText(body: Record<string, unknown>): string[] {
  const issues = Array.isArray(body.issues) ? body.issues : [];
  return issues.slice(0, MAXIMUM_FINDINGS_REPORTED).map(issue => {
    const { severity, message } = issue as { severity?: unknown; message?: unknown };
    return `${typeof severity === 'string' ? severity : 'error'}: ${String(message ?? '').slice(0, MAXIMUM_FINDING_CHARACTERS)}`;
  });
}

function windowOf(text: string, line: number | null | undefined, limit: number | null | undefined): string {
  if ((line === undefined || line === null) && (limit === undefined || limit === null)) return text;
  const lines = text.split(/(?<=\n)/);
  const start = Math.max(0, (line ?? 1) - 1);
  return lines.slice(start, limit === undefined || limit === null ? undefined : start + limit).join('');
}

/** Creates the read and write requests for one session. */
export function createFileRequests(dependencies: FileRequestDependencies) {
  let nextCard = 1;

  function failure(reason: FailureReason, extra: Partial<FileFailure> = {}): FileFailure {
    return { reason, message: SENTENCES[reason], ...extra };
  }
  function refused(path: string, reason: RefusalReason, findings?: readonly string[]): FileFailure {
    const card: ChangeCard = { id: nextCard++, path, outcome: 'refused', reason, ...(findings ? { findings } : {}) };
    return failure(reason, { card });
  }
  async function call(operation: string, params: Record<string, string>, body?: unknown): Promise<Response | undefined> {
    try {
      return await dependencies.operate(buildTwinRequest(operation, { params, body }));
    } catch (error) {
      if (error instanceof BadRequestError) return undefined;
      throw error;
    }
  }
  function readFailure(status: number): FileFailure {
    if (status === 413) return failure('too-large');
    if (status === 429) return failure('rate-limited');
    if (status === 400) return failure('not-text');
    return failure('not-available');
  }

  async function read(input: { path: unknown; line?: number | null; limit?: number | null }): Promise<ReadOutcome> {
    const parsed = parseVirtualPath(input.path);
    if (!parsed.ok) return { ok: false, failure: failure('not-available') };
    const permit = dependencies.admit();
    if (!permit.ok) return { ok: false, failure: failure('rate-limited') };
    try {
      const response = await call('files.read', { slug: parsed.project, '*': parsed.path });
      if (!response || !response.ok) return { ok: false, failure: readFailure(response?.status ?? 404) };
      const file = (await bodyOf(response)) as unknown as FileAnswer;
      if (Buffer.byteLength(file.source) > MAXIMUM_FILE_TEXT_BYTES) return { ok: false, failure: failure('too-large') };
      dependencies.versions.set(parsed.project, parsed.path, file.hash);
      return { ok: true, content: windowOf(file.source, input.line, input.limit) };
    } finally {
      permit.release();
    }
  }

  async function currentFile(project: string, path: string): Promise<{ status: number; file?: FileAnswer }> {
    const response = await call('files.read', { slug: project, '*': path });
    if (!response) return { status: 404 };
    if (!response.ok) return { status: response.status };
    return { status: 200, file: (await bodyOf(response)) as unknown as FileAnswer };
  }

  async function save(display: string, target: { project: string; path: string }, text: string, base: string | null, before: string | null): Promise<WriteOutcome> {
    const response = await call('files.save', { slug: target.project, '*': target.path }, { baseHash: base, source: text });
    if (!response) return { ok: false, failure: refused(display, 'not-available') };
    const body = await bodyOf(response);
    if (response.ok) {
      const answer = body as unknown as SaveAnswer;
      dependencies.versions.set(target.project, target.path, answer.hash);
      const stored = answer.source ?? text;
      const card: ChangeCard = {
        id: nextCard++,
        path: display,
        outcome: 'accepted',
        before: before ?? '',
        after: stored,
        version: answer.hash,
        ...(answer.source !== undefined ? { rewritten: true } : {}),
      };
      return { ok: true, card };
    }
    if (response.status === 409) return { ok: false, failure: refused(display, 'changed') };
    if (response.status === 400) return { ok: false, failure: refused(display, 'invalid', findingsText(body)) };
    if (response.status === 403 && Array.isArray(body.guarded)) return { ok: false, failure: { ...refused(display, 'guard'), message: typeof body.error === 'string' ? body.error : SENTENCES.guard } };
    if (response.status === 413) return { ok: false, failure: failure('too-large') };
    if (response.status === 429) return { ok: false, failure: refused(display, 'rate-limited') };
    return { ok: false, failure: refused(display, 'not-available') };
  }

  async function write(input: { path: unknown; content: unknown }): Promise<WriteOutcome> {
    const parsed = parseVirtualPath(input.path);
    if (!parsed.ok || typeof input.content !== 'string') return { ok: false, failure: failure('not-available') };
    if (Buffer.byteLength(input.content) > MAXIMUM_FILE_TEXT_BYTES) return { ok: false, failure: failure('too-large') };
    const permit = dependencies.admit();
    if (!permit.ok) return { ok: false, failure: refused(String(input.path), 'rate-limited') };
    const display = String(input.path);
    try {
      const current = await currentFile(parsed.project, parsed.path);
      if (current.status === 429) return { ok: false, failure: refused(display, 'rate-limited') };
      if (current.status !== 200 && current.status !== 404) return { ok: false, failure: refused(display, 'not-available') };
      if (!current.file) return await save(display, parsed, input.content, null, null);
      const recorded = dependencies.versions.get(parsed.project, parsed.path);
      if (recorded === undefined) return { ok: false, failure: refused(display, 'unread') };
      if (recorded !== current.file.hash) return { ok: false, failure: refused(display, 'changed') };
      // A repeat of text the file already holds is answered as applied, so a lost answer never turns into a false conflict.
      if (current.file.source === input.content) return { ok: true };
      return await save(display, parsed, input.content, recorded, current.file.source);
    } finally {
      permit.release();
    }
  }

  return { read, write };
}

export type FileRequests = ReturnType<typeof createFileRequests>;
