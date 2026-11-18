// Focused assertions that run against a candidate module the mutation gate has made faulty. Each case names the tests that guard the same behaviour.
import assert from 'node:assert/strict';
import { HiddenResourceError } from '../src/server/projects/errors';
import { LOCAL_READER } from '../src/server/projects/reader';
import { compileUnit } from '../src/shared/tessera/compile-unit';
import { sha256Hex } from '../src/shared/tessera/digest';
import { COMPILE_PROJECT, compileWorkspace, readerFor } from '../tests/helpers/compile-workspace';
import { ONTOLOGY_TEXT, SEMANTIC_MODEL_TEXT } from '../tests/helpers/tessera-repository';

type Candidate = Record<string, any>;

/** A focused case: which candidate it applies to, the tests that guard the same behaviour and the assertions. */
export type CompileCase = { name: string; applies: (candidate: Candidate) => boolean; tests: string[]; run: (candidate: Candidate) => Promise<void> | void };

const encoder = new TextEncoder();
const has = (name: string) => (candidate: Candidate) => typeof candidate[name] === 'function';
const COMMIT = 'a'.repeat(40);
const withNotes = [{ path: 'retail.ontology.yaml', bytes: encoder.encode(ONTOLOGY_TEXT) }];
const lossy = compileUnit(withNotes, { lossPolicySha256: null });

async function rejectionOf(work: Promise<unknown>): Promise<any> {
  try {
    await work;
  } catch (error) {
    return error;
  }
  return assert.fail('Expected a refusal.');
}

/** A unit source that records which kind was read and answers with the given files. */
function recordingUnits(files = withNotes, commit = COMMIT) {
  const kinds: string[] = [];
  const place = { commit, branch: 'main', projectFolder: '.' };
  return {
    kinds,
    units: {
      read: async (kind: string) => {
        kinds.push(kind);
        return kind === 'published' ? { files, label: { kind: 'published-snapshot', commit, unpublished: false }, commit, place } : { files, label: { kind: 'working-copy', unpublished: true } };
      },
    },
  };
}

export const COMPILE_CASES: CompileCase[] = [
  {
    name: 'a failure is never accepted, and a loss is accepted only for the exact digest',
    applies: has('decideAcceptance'),
    tests: ['tests/compile/accept-loss.test.ts'],
    run(candidate) {
      const failure = [{ code: 'meaning', message: 'x' }];
      assert.deepEqual(candidate.decideAcceptance(lossy.report, failure, { digest: lossy.report.digest }), { decision: 'refused' });
      assert.deepEqual(candidate.decideAcceptance(lossy.report, [], { digest: lossy.report.digest }), { decision: 'accepted', accepted: 'digest' });
      assert.equal(candidate.decideAcceptance(lossy.report, [], { digest: 'sha256:' + '0'.repeat(64) }).decision, 'needs-acceptance');
    },
  },
  {
    name: 'a part read needs the commit it was shown, never cuts a character and never skips a byte',
    applies: has('readOutputPart'),
    tests: ['tests/compile/output-part.test.ts'],
    run(candidate) {
      const text = 'café '.repeat(30);
      const source = { commit: COMMIT, path: 'a.yaml', version: 'v', bytes: encoder.encode(text) };
      assert.throws(() => candidate.readOutputPart(source, { commit: undefined, offset: 0 }), { reason: 'commit-required' });
      assert.throws(() => candidate.readOutputPart(source, { commit: 'b'.repeat(40), offset: 0 }), { reason: 'snapshot-changed' });
      assert.throws(() => candidate.readOutputPart(source, { commit: COMMIT, offset: 4 }), 'an offset inside a character is refused');
      let walked = '';
      let offset: number | null = 0;
      while (offset !== null) {
        const part: { text: string; nextOffset: number | null } = candidate.readOutputPart(source, { commit: COMMIT, offset }, 7);
        walked += part.text;
        offset = part.nextOffset;
      }
      assert.equal(walked, text);
    },
  },
  {
    name: 'a unit is whole or refused: a hidden or vanished file looks like a missing one, limits come before any read, and the source kind picks the reader',
    applies: has('createUnitSource'),
    tests: ['tests/compile/unit-source.test.ts'],
    async run(candidate) {
      const reads: string[] = [];
      const view = (files: { path: string; size: number }[], content: Uint8Array | null = new Uint8Array(1)) => ({
        list: async () => files,
        read: async (path: string) => {
          reads.push(path);
          return content;
        },
      });
      const build = (options: Record<string, unknown>) =>
        candidate.createUnitSource({
          canRead: () => true,
          openPublished: async (use: any) => use({ ...view([]), place: { commit: COMMIT, branch: 'main', projectFolder: '.' } }),
          openWorking: async () => view([]),
          ...options,
        });
      const two = [
        { path: 'a.yaml', size: 1 },
        { path: 'secret.yaml', size: 1 },
      ];
      const hidden = await rejectionOf(build({ openWorking: async () => view(two), canRead: (path: string) => path !== 'secret.yaml' }).read('working'));
      assert.ok(hidden instanceof HiddenResourceError);
      const vanished = await rejectionOf(build({ openWorking: async () => view(two, null) }).read('working'));
      assert.ok(vanished instanceof HiddenResourceError);
      reads.length = 0;
      const tooMany = { documentBytes: 100, totalBytes: 100, projectFiles: 1 };
      assert.equal((await rejectionOf(build({ openWorking: async () => view(two), limits: tooMany }).read('working'))).name, 'UnitLimitError');
      const tooBig = { documentBytes: 1, totalBytes: 100, projectFiles: 5 };
      assert.equal((await rejectionOf(build({ openWorking: async () => view([{ path: 'big.yaml', size: 2 }]), limits: tooBig }).read('working'))).name, 'UnitLimitError');
      assert.deepEqual(reads, []);
      const published = await build({ openWorking: async () => assert.fail('The working copy must not be read.') }).read('published');
      assert.equal(published.commit, COMMIT);
      const working = await build({ openPublished: async () => assert.fail('The published snapshot must not be read.') }).read('working');
      assert.deepEqual(working.label, { kind: 'working-copy', unpublished: true });
    },
  },
  {
    name: 'a compile reads the published snapshot only, finishes on the commit it pinned, and a part needs the commit',
    applies: has('compilePublished'),
    tests: ['tests/compile/compile-service.test.ts', 'tests/compile/browser-and-cli.test.ts'],
    async run(candidate) {
      const { kinds, units } = recordingUnits();
      const released = await candidate.compilePublished(units, { accept: { digest: lossy.report.digest } });
      assert.equal(released.result, 'released');
      assert.deepEqual(kinds, ['published']);
      assert.equal(released.manifest.source.commit, COMMIT);
      assert.equal((await rejectionOf(candidate.compilePublished(units, { commit: 'b'.repeat(40) }))).name, 'SnapshotChangedError');
      const file = { path: 'manifest.json', offset: 0 };
      assert.ok((await rejectionOf(candidate.runCompile(units, { accept: { digest: lossy.report.digest } }, file))) instanceof Error, 'a part without the commit is refused');
      const part = await candidate.runCompile(units, { accept: { digest: lossy.report.digest }, commit: COMMIT }, file);
      assert.equal(part.part.path, 'manifest.json');
    },
  },
  {
    name: 'a conversion checks the file, Git, the version, the inputs and the digest before it saves, and saves once',
    applies: has('convertToStandard'),
    tests: ['tests/compile/convert-service.test.ts'],
    async run(candidate) {
      const hash = sha256Hex(encoder.encode(ONTOLOGY_TEXT));
      const request = { path: 'retail.ontology.yaml', baseHash: hash, inputs: lossy.report.inputs.map((input: any) => ({ path: input.path, sha256: input.sha256 })), digest: lossy.report.digest };
      const saves: string[] = [];
      const deps = (overrides: Record<string, unknown> = {}) => ({
        units: recordingUnits().units,
        currentFile: (path: string) => (path === 'retail.ontology.yaml' ? { hash, bytes: encoder.encode(ONTOLOGY_TEXT) } : null),
        committedState: async () => 'clean',
        save: async (_path: string, _base: string, source: string) => {
          saves.push(source);
          return { hash: 'new' };
        },
        ...overrides,
      });
      const codeOf = async (work: Promise<unknown>) => (await rejectionOf(work)).code;
      assert.equal((await candidate.convertToStandard(deps(), request)).version, 'new');
      assert.equal(saves.length, 1);
      assert.equal(saves[0].includes('tessera'), false);
      saves.length = 0;
      assert.equal(await codeOf(candidate.convertToStandard(deps({ committedState: async () => 'changed' }), request)), 'dirty');
      assert.equal(await codeOf(candidate.convertToStandard(deps({ committedState: async () => 'no-history' }), request)), 'no-history');
      assert.equal(await codeOf(candidate.convertToStandard(deps(), { ...request, baseHash: 'f'.repeat(64) })), 'version-changed');
      assert.equal(await codeOf(candidate.convertToStandard(deps(), { ...request, inputs: [] })), 'digest-mismatch');
      assert.equal(await codeOf(candidate.convertToStandard(deps(), { ...request, digest: 'sha256:' + '0'.repeat(64) })), 'digest-mismatch');
      const standard = encoder.encode(SEMANTIC_MODEL_TEXT);
      const notTessera = deps({ currentFile: () => ({ hash: sha256Hex(standard), bytes: standard }) });
      assert.equal(await codeOf(candidate.convertToStandard(notTessera, { ...request, baseHash: sha256Hex(standard) })), 'not-tessera');
      const refusing = (files: typeof withNotes) => recordingUnits(files).units;
      const broken = [{ path: 'retail.ontology.yaml', bytes: encoder.encode(ONTOLOGY_TEXT.replace('tessera: 1', 'tessera: 1\ntessera_unknown: yes')) }];
      assert.equal(await codeOf(candidate.convertToStandard(deps({ units: refusing(broken) }), request)), 'refused');
      assert.deepEqual(saves, [], 'a refused conversion never saves');
    },
  },
  {
    name: 'a person who may not read every file of the unit gets the answer for a missing file from the workspace',
    applies: has('workspaceUnitSource'),
    tests: ['tests/compile/unit-source.test.ts', 'tests/auth/compile-parity.test.ts'],
    async run(candidate) {
      using workspace = await compileWorkspace();
      const refusal = await rejectionOf(candidate.workspaceUnitSource(workspace.ws, COMPILE_PROJECT, readerFor('alice')).read('published'));
      assert.ok(refusal instanceof HiddenResourceError);
      const allowed = await candidate.workspaceUnitSource(workspace.ws, COMPILE_PROJECT, LOCAL_READER).read('published');
      assert.ok(allowed.files.length > 0);
    },
  },
];

/** Runs every case that applies to the candidate, and fails when none does. */
export async function compileCase(candidate: Candidate) {
  const matching = COMPILE_CASES.filter(entry => entry.applies(candidate));
  assert.ok(matching.length > 0, 'No compile case applies to this module.');
  for (const entry of matching) await entry.run(candidate);
}
