// Checks the explicit conversion of a 0.2 document to the 0.3 draft base: the preview lists every change, and the confirmation applies exactly that only to a clean, unchanged file.
import { beforeAll, expect, test } from 'bun:test';
import { parse } from 'yaml';
import type { ContentGuard } from '../../src/server/auth/guards';
import { LOCAL_READER, type Reader } from '../../src/server/projects/reader';
import { ConvertRefusal, convertBase } from '../../src/server/tessera/convert-service';
import { workspaceConversion } from '../../src/server/tessera/workspace-conversion';
import { BaseConversionRefusal, convertToDraftBase } from '../../src/shared/tessera/base-conversion';
import { sha256Hex } from '../../src/shared/tessera/digest';
import { loadDraftValidators } from '../../src/shared/validation/draft-validators';
import { COMPILE_PROJECT, compileWorkspace, readerFor, sendToCompile } from '../helpers/compile-workspace';

const MODEL = 'retail.semantic.yaml';
const ROUTE = `/api/projects/${COMPILE_PROJECT}/compile/convert-base`;

beforeAll(async () => {
  await loadDraftValidators();
});

type Workspace = Awaited<ReturnType<typeof compileWorkspace>>;

/** What the preview would send for the model as it is now. */
function previewRequest(workspace: Workspace) {
  const current = workspace.ws.readFile(COMPILE_PROJECT, MODEL, LOCAL_READER);
  const conversion = convertToDraftBase(current.source, MODEL);
  return { request: { path: MODEL, baseHash: current.hash, converted: conversion.sha256 }, conversion };
}

test('the preview lists the version change and changes nothing on disk', async () => {
  using workspace = await compileWorkspace();
  const before = workspace.ws.readFile(COMPILE_PROJECT, MODEL, LOCAL_READER).source;
  const { conversion } = previewRequest(workspace);
  expect(conversion.changes[0]).toEqual({ pointer: '/version', kind: 'version', before: '0.2.0.dev0', after: '0.3.0.dev0' });
  expect(parse(conversion.text).version).toBe('0.3.0.dev0');
  expect(workspace.ws.readFile(COMPILE_PROJECT, MODEL, LOCAL_READER).source).toBe(before);
});

test('confirming a clean, unchanged file saves exactly the previewed text', async () => {
  using workspace = await compileWorkspace();
  const { request, conversion } = previewRequest(workspace);
  const response = await sendToCompile(workspace, ROUTE, request);
  expect(response.status).toBe(200);
  const saved = workspace.ws.readFile(COMPILE_PROJECT, MODEL, LOCAL_READER);
  expect(saved.source).toBe(conversion.text);
  expect(sha256Hex(new TextEncoder().encode(saved.source))).toBe(request.converted);
});

test('a file that changed after the preview is refused as stale, and nothing is written', async () => {
  using workspace = await compileWorkspace();
  const { request } = previewRequest(workspace);
  const response = await sendToCompile(workspace, ROUTE, { ...request, baseHash: 'f'.repeat(64) });
  expect(response.status).toBe(409);
  expect((await response.json()).error).toBe('version-changed');
  expect(parse(workspace.ws.readFile(COMPILE_PROJECT, MODEL, LOCAL_READER).source).version).toBe('0.2.0.dev0');
});

test('a file with uncommitted changes is refused, so Git always holds the backup', async () => {
  using workspace = await compileWorkspace();
  const current = workspace.ws.readFile(COMPILE_PROJECT, MODEL, LOCAL_READER);
  await workspace.editWorkingCopy(MODEL, current.source.replace('name:', '# edited\nname:'));
  const { request } = previewRequest(workspace);
  const response = await sendToCompile(workspace, ROUTE, request);
  expect(response.status).toBe(409);
  expect((await response.json()).error).toBe('dirty');
});

test('a confirmation that does not match the previewed text is refused', async () => {
  using workspace = await compileWorkspace();
  const { request } = previewRequest(workspace);
  const response = await sendToCompile(workspace, ROUTE, { ...request, converted: '0'.repeat(64) });
  expect(response.status).toBe(409);
  expect((await response.json()).error).toBe('digest-mismatch');
});

test('a document that does not declare 0.2.0.dev0 cannot be converted', () => {
  expect(() => convertToDraftBase('version: 0.3.0.dev0\nname: x\ndatasets: []\n', 'x.yaml')).toThrow(BaseConversionRefusal);
  expect(() => convertToDraftBase('version: 0.2.0.dev0\nname: x\ncustom_extensions:\n  - vendor_name: V\n    data: not json\n', 'x.yaml')).toThrow('is not a JSON object');
});

test('a guard that would rewrite the confirmed text refuses the conversion, and nothing is written', async () => {
  using workspace = await compileWorkspace();
  const before = workspace.ws.readFile(COMPILE_PROJECT, MODEL, LOCAL_READER).source;
  const { request } = previewRequest(workspace);
  // Stands in for a demotion: the guard stores other bytes than the ones the person confirmed.
  const rewriting: ContentGuard = changes => ({ changes: changes.map(change => ({ ...change, after: change.after + '# rewritten\n' })), refused: [], demoted: [] });
  const reader = { ...readerFor('alice'), guard: rewriting } as Reader;
  const refusal = await convertBase(workspaceConversion(workspace.ws, COMPILE_PROJECT, reader), request).catch(error => error);
  expect(refusal).toBeInstanceOf(ConvertRefusal);
  expect(refusal.code).toBe('digest-mismatch');
  expect(workspace.ws.readFile(COMPILE_PROJECT, MODEL, LOCAL_READER).source).toBe(before);
});
