// Turns the body or query of a compile request into typed values, refusing anything the operation does not take. Nothing past this file sees raw request data.
import type { LossPolicy } from '../../shared/tessera/loss-report';
import { BadRequestError } from '../projects/errors';
import { isPolicyError, readInlinePolicy } from './accept-loss';
import type { AcceptanceRequest, FileRequest } from './compile-service';
import type { UnitSourceKind } from './unit-source';

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const HASH = /^[0-9a-f]{64}$/;

/** A parsed check request. */
export type CheckRequest = { source: UnitSourceKind; lossPolicy?: LossPolicy };

/** A parsed compile request. */
export type RunRequest = { accept?: AcceptanceRequest; commit?: string; file?: FileRequest };

/** A parsed conversion request. */
export type ConvertRequest = { path: string; baseHash: string; inputs: { path: string; sha256: string }[]; digest: string };
/** The target a base conversion names. Only the Ossie 0.3.0 draft base can be converted to. */
export const DRAFT_BASE_TARGET = 'ossie-0.3.0.dev0';
/** A reviewed base conversion: the file, the version the preview read, and the hash of the converted text it showed. */
export type BaseConvertRequest = { path: string; baseHash: string; target: typeof DRAFT_BASE_TARGET; converted: string };

function objectFrom(value: unknown, shape: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestError(`Expected ${shape}.`);
  return value as Record<string, unknown>;
}

function refuseUnknownKeys(body: Record<string, unknown>, allowed: string[], shape: string) {
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new BadRequestError(`Expected ${shape}.`);
}

function digestFrom(value: unknown): string {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new BadRequestError('A digest looks like sha256: followed by 64 lowercase hexadecimal characters.');
  return value;
}

function commitFrom(value: unknown): string {
  if (typeof value !== 'string' || !COMMIT.test(value)) throw new BadRequestError('A commit must be a full commit identifier.');
  return value;
}

function policyFrom(value: unknown): LossPolicy {
  try {
    return readInlinePolicy(value);
  } catch (error) {
    if (isPolicyError(error)) throw new BadRequestError(error.message);
    throw error;
  }
}

function acceptanceFrom(value: unknown): AcceptanceRequest {
  const accept = objectFrom(value, '{accept: {digest} or {lossPolicy}}');
  refuseUnknownKeys(accept, ['digest', 'lossPolicy'], '{accept: {digest} or {lossPolicy}}');
  if ((accept.digest === undefined) === (accept.lossPolicy === undefined)) throw new BadRequestError('Accept needs either a digest or a loss policy.');
  return accept.digest !== undefined ? { digest: digestFrom(accept.digest) } : { lossPolicy: policyFrom(accept.lossPolicy) };
}

function fileFrom(value: unknown): FileRequest {
  const file = objectFrom(value, '{file: {path, offset}}');
  refuseUnknownKeys(file, ['path', 'offset'], '{file: {path, offset}}');
  if (typeof file.path !== 'string' || !file.path) throw new BadRequestError('A file needs its path.');
  const offset = file.offset ?? 0;
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) throw new BadRequestError('The offset must be a whole number of bytes, zero or more.');
  return { path: file.path, offset };
}

/** Reads the body of a check request. The source is the published snapshot unless the working copy is named. */
export function parseCheckRequest(value: unknown): CheckRequest {
  const body = objectFrom(value, '{source, lossPolicy}');
  refuseUnknownKeys(body, ['source', 'lossPolicy'], '{source, lossPolicy}');
  const source = body.source ?? 'published';
  if (source !== 'published' && source !== 'working') throw new BadRequestError('The source must be published or working.');
  return { source, ...(body.lossPolicy === undefined ? {} : { lossPolicy: policyFrom(body.lossPolicy) }) };
}

/** Reads the body of a compile request. A file part needs the commit the person was shown. */
export function parseRunRequest(value: unknown): RunRequest {
  const body = objectFrom(value, '{accept, commit, file}');
  refuseUnknownKeys(body, ['accept', 'commit', 'file'], '{accept, commit, file}');
  const request: RunRequest = {};
  if (body.accept !== undefined) request.accept = acceptanceFrom(body.accept);
  if (body.commit !== undefined) request.commit = commitFrom(body.commit);
  if (body.file !== undefined) request.file = fileFrom(body.file);
  if (request.file && !request.commit) throw new BadRequestError('Reading a part of a file needs the commit the compile reported.');
  return request;
}

/** Reads the query of a bundle download, where acceptance is by digest only. */
export function parseBundleQuery(url: URL): { accept?: AcceptanceRequest; commit?: string } {
  const digest = url.searchParams.get('accept');
  const commit = url.searchParams.get('commit');
  return { ...(digest === null ? {} : { accept: { digest: digestFrom(digest) } }), ...(commit === null ? {} : { commit: commitFrom(commit) }) };
}

function inputsFrom(value: unknown): ConvertRequest['inputs'] {
  if (!Array.isArray(value)) throw new BadRequestError('Inputs must list the files the review saw, each with its path and hash.');
  return value.map(item => {
    const input = objectFrom(item, '{path, sha256}');
    refuseUnknownKeys(input, ['path', 'sha256'], '{path, sha256}');
    if (typeof input.path !== 'string' || typeof input.sha256 !== 'string' || !HASH.test(input.sha256)) throw new BadRequestError('Each input needs a path and a SHA-256 hash.');
    return { path: input.path, sha256: input.sha256 };
  });
}

/** Reads the body of a conversion request: the file, the version the review saw, the input hashes and the digest accepted. */
export function parseConvertRequest(value: unknown): ConvertRequest {
  const body = objectFrom(value, '{path, baseHash, inputs, accept}');
  refuseUnknownKeys(body, ['path', 'baseHash', 'inputs', 'accept'], '{path, baseHash, inputs, accept}');
  if (typeof body.path !== 'string' || !body.path) throw new BadRequestError('Conversion needs the path of the file.');
  if (typeof body.baseHash !== 'string' || !HASH.test(body.baseHash)) throw new BadRequestError('baseHash must be the SHA-256 of the file version the review saw.');
  const accept = objectFrom(body.accept, '{accept: {digest}}');
  refuseUnknownKeys(accept, ['digest'], '{accept: {digest}}');
  return { path: body.path, baseHash: body.baseHash, inputs: inputsFrom(body.inputs), digest: digestFrom(accept.digest) };
}

/** Tells a base conversion from a conversion to standard Ossie: only the first names a target. */
export function isBaseConvertBody(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && 'target' in value;
}

/** Reads the body of a base conversion: the file, the version the preview read, the target and the hash of the converted text shown. */
export function parseBaseConvertRequest(value: unknown): BaseConvertRequest {
  const body = objectFrom(value, '{path, baseHash, target, converted}');
  refuseUnknownKeys(body, ['path', 'baseHash', 'target', 'converted'], '{path, baseHash, target, converted}');
  if (typeof body.path !== 'string' || !body.path) throw new BadRequestError('Conversion needs the path of the file.');
  if (typeof body.baseHash !== 'string' || !HASH.test(body.baseHash)) throw new BadRequestError('baseHash must be the SHA-256 of the file version the preview read.');
  if (body.target !== DRAFT_BASE_TARGET) throw new BadRequestError(`target must be ${DRAFT_BASE_TARGET}.`);
  if (typeof body.converted !== 'string' || !HASH.test(body.converted)) throw new BadRequestError('converted must be the SHA-256 of the converted text the preview showed.');
  return { path: body.path, baseHash: body.baseHash, target: DRAFT_BASE_TARGET, converted: body.converted };
}
