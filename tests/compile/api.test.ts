// Ensures only completed, matching HTTP acknowledgements advance compile and conversion UI state.
import { afterEach, expect, spyOn, test } from 'bun:test';
import { compileApi, type ConvertBody } from '../../src/app/compile/api';
import { checkUnit } from '../../src/server/tessera/compile-service';
import { ONTOLOGY_TEXT } from '../helpers/tessera-repository';

const path = 'retail.ontology.yaml';
const commit = 'a'.repeat(40);
const hash = 'b'.repeat(64);
const digest = `sha256:${hash}`;
const request: ConvertBody = { path, baseHash: hash, inputs: [{ path, sha256: hash }], accept: { digest } };
const converted = { path, version: hash, lossDigest: digest };
let fetchSpy: ReturnType<typeof spyOn> | undefined;

afterEach(() => fetchSpy?.mockRestore());

function reply(body: unknown, status = 200) {
  fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(body, { status }));
}

test('conversion accepts only HTTP 200 with the requested path, a hash and the reviewed digest', async () => {
  reply(converted);
  expect(await compileApi.convert('retail', request)).toEqual(converted);
  fetchSpy?.mockRestore();
  for (const body of [
    { ...converted, path: '' },
    { ...converted, version: '' },
    { ...converted, version: 23 },
    { ...converted, lossDigest: `sha256:${'c'.repeat(64)}` },
  ]) {
    reply(body);
    await expect(compileApi.convert('retail', request)).rejects.toThrow('invalid compile acknowledgement');
    fetchSpy?.mockRestore();
  }
  reply(converted, 202);
  await expect(compileApi.convert('retail', request)).rejects.toThrow('invalid compile acknowledgement');
});

test('a valid check passes while unknown results and missing identifiers are refused', async () => {
  const answer = await checkUnit(
    { read: async () => ({ files: [{ path, bytes: new TextEncoder().encode(ONTOLOGY_TEXT) }], label: { kind: 'published-snapshot', commit, unpublished: false } }) },
    { source: 'published' },
  );
  reply(answer);
  expect(await compileApi.check('retail', 'published')).toEqual(answer);
  fetchSpy?.mockRestore();
  for (const body of [
    { ...answer, result: 'pending' },
    { ...answer, source: { kind: 'published-snapshot', commit: '' } },
    { ...answer, accepted: 'yes' },
    { ...answer, report: { ...answer.report, reportVersion: 3 } },
  ]) {
    reply(body);
    await expect(compileApi.check('retail', 'published')).rejects.toThrow('invalid compile acknowledgement');
    fetchSpy?.mockRestore();
  }
});

test('compile refuses unknown acceptance states even on HTTP 200', async () => {
  reply({ result: 'pending', source: { kind: 'published-snapshot', commit } });
  await expect(compileApi.run('retail', digest, commit)).rejects.toThrow('invalid compile acknowledgement');
});

test('download refuses an accepted response that is not a completed ZIP for the requested commit', async () => {
  fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('queued', { status: 202 }));
  await expect(compileApi.download('retail', digest, commit)).rejects.toThrow('invalid compile download');
});
