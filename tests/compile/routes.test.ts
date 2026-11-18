// Checks the compile routes in local mode: status mapping, the zip headers and contents, refusals before any byte of a zip, and the download size ceiling.
import { expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { bundleResponse } from '../../src/server/routes/compile';
import { compilePublished } from '../../src/server/tessera/compile-service';
import { workspaceUnitSource } from '../../src/server/tessera/workspace-unit-source';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { COMPILE_PROJECT, ONTOLOGY_PATH, TESSERA_FILES, compileWorkspace, sendToCompile } from '../helpers/compile-workspace';
import { readZip } from '../helpers/zip-reader';

const base = `/api/projects/${COMPILE_PROJECT}/compile`;

async function reportDigest(workspace: Awaited<ReturnType<typeof compileWorkspace>>): Promise<{ digest: string; commit: string }> {
  const body = await (await sendToCompile(workspace, base, {})).json();
  return { digest: body.report.digest, commit: body.source.commit };
}

test('check answers 200 with findings and the report, and names the published commit', async () => {
  using workspace = await compileWorkspace();
  const response = await sendToCompile(workspace, `${base}/check`, { source: 'published' });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.result).toBe('loss');
  expect(body.source.kind).toBe('published-snapshot');
  expect(body.base.label).toContain('Ossie');
  expect(body.report.digest).toMatch(/^sha256:/);
  expect(JSON.stringify(body)).not.toContain('manifest');
});

test('check of the working copy says unpublished, and a body the contract does not take is refused', async () => {
  using workspace = await compileWorkspace();
  const working = await (await sendToCompile(workspace, `${base}/check`, { source: 'working' })).json();
  expect(working.source).toEqual({ kind: 'working-copy', unpublished: true });
  expect((await sendToCompile(workspace, `${base}/check`, { source: 'elsewhere' })).status).toBe(400);
  expect((await sendToCompile(workspace, `${base}/check`, { source: 'published', extra: true })).status).toBe(400);
  expect((await sendToCompile(workspace, `${base}/check`, { lossPolicy: { policy: 1, allow: ['unknown_property'] } })).status).toBe(400);
});

test('compile without acceptance shows the report and releases nothing; the exact digest releases the files and the manifest', async () => {
  using workspace = await compileWorkspace();
  const first = await (await sendToCompile(workspace, base, {})).json();
  expect(first.result).toBe('loss-needs-acceptance');
  expect(first).not.toHaveProperty('manifest');
  const released = await (await sendToCompile(workspace, base, { accept: { digest: first.report.digest }, commit: first.source.commit })).json();
  expect(released.result).toBe('released');
  expect(released.manifest.loss).toEqual({ digest: first.report.digest, accepted: 'digest' });
  expect(released.files.map((file: { path: string }) => file.path)).toContain('loss-report.json');
});

test('a part of a file is read with the commit, refused without it, and a moved commit answers 409', async () => {
  using workspace = await compileWorkspace();
  const { digest, commit } = await reportDigest(workspace);
  const file = { path: 'manifest.json', offset: 0 };
  const part = await (await sendToCompile(workspace, base, { accept: { digest }, commit, file })).json();
  expect(part.part.text).toContain('"manifestVersion"');
  expect((await sendToCompile(workspace, base, { accept: { digest }, file })).status).toBe(400);
  const moved = await sendToCompile(workspace, base, { accept: { digest }, commit: 'e'.repeat(40) });
  expect(moved.status).toBe(409);
  expect((await moved.json()).error).toBe('snapshot-changed');
});

test('a project with no snapshot answers not-published for compile and check of the published source, but not for the working copy', async () => {
  using workspace = await compileWorkspace();
  const draft = `/api/projects/${workspace.unpublishedProject}/compile`;
  for (const [path, body] of [
    [draft, {}],
    [`${draft}/check`, { source: 'published' }],
  ] as const) {
    const response = await sendToCompile(workspace, path, body);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'not-published' });
  }
  expect((await sendToCompile(workspace, `${draft}/check`, { source: 'working' })).status).toBe(200);
});

test('the bundle download is a zip with the headers of the contract and the same files as the golden bundle', async () => {
  using workspace = await compileWorkspace();
  const { digest, commit } = await reportDigest(workspace);
  const response = await sendToCompile(workspace, `${base}/bundle?accept=${digest}&commit=${commit}`);
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toBe('application/zip');
  expect(response.headers.get('Content-Disposition')).toBe(`attachment; filename="${COMPILE_PROJECT}-standard-ossie.zip"`);
  expect(response.headers.get('X-Compile-Commit')).toBe(commit);
  expect(response.headers.get('X-Compile-Digest')).toBe(digest);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(Number(response.headers.get('Content-Length'))).toBe(bytes.length);
  const files = readZip(bytes);
  expect([...files.keys()]).toContain('manifest.json');
  expect(new TextDecoder().decode(files.get(ONTOLOGY_PATH)!)).not.toContain('tessera');
});

test('a download that cannot be released is refused with JSON before any byte of a zip', async () => {
  using workspace = await compileWorkspace();
  const unaccepted = await sendToCompile(workspace, `${base}/bundle`);
  expect(unaccepted.status).toBe(409);
  expect(unaccepted.headers.get('Content-Type')).toContain('application/json');
  const body = await unaccepted.json();
  expect(body.error).toBe('acceptance-required');
  expect(body.report.digest).toMatch(/^sha256:/);
  expect((await sendToCompile(workspace, `${base}/bundle?accept=not-a-digest`)).status).toBe(400);
  expect((await sendToCompile(workspace, `${base}/bundle?commit=abc`)).status).toBe(400);
  const stale = await sendToCompile(workspace, `${base}/bundle?accept=sha256:${'0'.repeat(64)}`);
  expect(stale.status).toBe(409);
});

test('a bundle over the download ceiling is refused before the first byte', async () => {
  using workspace = await compileWorkspace();
  const units = workspaceUnitSource(workspace.ws, COMPILE_PROJECT, LOCAL_READER);
  const outcome = await compilePublished(units, { accept: { digest: (await reportDigest(workspace)).digest } });
  if (outcome.result !== 'released') throw new Error('Expected a release.');
  expect(() => bundleResponse(outcome, COMPILE_PROJECT, 100)).toThrow('too large');
  expect(bundleResponse(outcome, COMPILE_PROJECT, 64_000_000).status).toBe(200);
});

test('a compile refused by the compiler lists its findings and cannot be accepted', async () => {
  using workspace = await compileWorkspace();
  const broken = TESSERA_FILES[ONTOLOGY_PATH].replace('tessera: 1', 'tessera: 1\ntessera_unknown_property: yes');
  writeFileSync(workspace.ws.filePath(COMPILE_PROJECT, ONTOLOGY_PATH, LOCAL_READER), broken);
  const check = await (await sendToCompile(workspace, `${base}/check`, { source: 'working' })).json();
  expect(check.result).toBe('refused');
  expect(check.findings.length).toBeGreaterThan(0);
  expect(check.findings[0].document).toBe(ONTOLOGY_PATH);
});

async function conversionBody(workspace: Awaited<ReturnType<typeof compileWorkspace>>) {
  const check = await (await sendToCompile(workspace, `${base}/check`, { source: 'working' })).json();
  return {
    path: ONTOLOGY_PATH,
    baseHash: workspace.ws.readFile(COMPILE_PROJECT, ONTOLOGY_PATH, LOCAL_READER).hash,
    inputs: check.report.inputs.map((input: { path: string; sha256: string }) => ({ path: input.path, sha256: input.sha256 })),
    accept: { digest: check.report.digest },
  };
}

test('convert answers 200 with the new version and the accepted digest, and the file is standard afterwards', async () => {
  using workspace = await compileWorkspace();
  const body = await conversionBody(workspace);
  const response = await sendToCompile(workspace, `${base}/convert`, body);
  expect(response.status).toBe(200);
  const answer = await response.json();
  expect(answer).toMatchObject({ path: ONTOLOGY_PATH, lossDigest: body.accept.digest });
  expect(answer.version).toBe(workspace.ws.readFile(COMPILE_PROJECT, ONTOLOGY_PATH, LOCAL_READER).hash);
  expect(workspace.ws.readFile(COMPILE_PROJECT, ONTOLOGY_PATH, LOCAL_READER).source).not.toContain('tessera');
});

test('convert maps each refusal to its status and its own error name', async () => {
  using workspace = await compileWorkspace();
  const body = await conversionBody(workspace);
  const stale = await sendToCompile(workspace, `${base}/convert`, { ...body, baseHash: 'f'.repeat(64) });
  expect(stale.status).toBe(409);
  expect((await stale.json()).error).toBe('version-changed');
  const mismatch = await sendToCompile(workspace, `${base}/convert`, { ...body, accept: { digest: 'sha256:' + '0'.repeat(64) } });
  expect((await mismatch.json()).error).toBe('digest-mismatch');
  const notTessera = await sendToCompile(workspace, `${base}/convert`, { ...body, path: 'retail.semantic.yaml' });
  expect([409, 404]).toContain(notTessera.status);
  expect((await sendToCompile(workspace, `${base}/convert`, { path: ONTOLOGY_PATH })).status).toBe(400);
  await workspace.editWorkingCopy(ONTOLOGY_PATH, TESSERA_FILES[ONTOLOGY_PATH] + '# not committed\n');
  const dirty = await sendToCompile(workspace, `${base}/convert`, { ...(await conversionBody(workspace)) });
  expect(dirty.status).toBe(409);
  expect((await dirty.json()).error).toBe('dirty');
});

test('convert only answers POST', async () => {
  using workspace = await compileWorkspace();
  expect((await sendToCompile(workspace, `${base}/convert`)).status).toBeGreaterThanOrEqual(400);
});
