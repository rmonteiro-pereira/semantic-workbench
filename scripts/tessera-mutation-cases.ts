// Focused assertions that run against a candidate module the mutation gate has made faulty. Each case names the tests that guard the same behaviour.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { InputError } from '../src/shared/validation/diagnostics';
import { REGISTRY } from '../src/shared/tessera/registry';
import { EXPECTED_FINDINGS } from '../tests/helpers/tessera-refusals';
import { COMMITTED_FILES, ONTOLOGY_TEXT, PROJECT_FOLDER, createTesseraRepository } from '../tests/helpers/tessera-repository';

type Candidate = Record<string, any>;

/** A focused case: which candidate it applies to, the tests that guard the same behaviour and the assertions. */
export type TesseraCase = { name: string; applies: (candidate: Candidate) => boolean; tests: string[]; run: (candidate: Candidate) => Promise<void> | void };

const documents = 'tests/fixtures/tessera/documents';
const readDocument = (name: string) => readFileSync(join(documents, name), 'utf8');
const encoder = new TextEncoder();
const options = { lossPolicySha256: null };
const projectFiles = Object.entries(COMMITTED_FILES)
  .filter(([path]) => path.startsWith(PROJECT_FOLDER))
  .map(([path, text]) => ({ path: path.slice(PROJECT_FOLDER.length + 1), bytes: encoder.encode(text) }));

function issuesOf(run: () => unknown): { code: string; path: string }[] {
  try {
    run();
    return [];
  } catch (error) {
    if (error instanceof InputError) return error.issues;
    throw error;
  }
}

const has = (name: string) => (candidate: Candidate) => typeof candidate[name] === 'function';

export const TESSERA_CASES: TesseraCase[] = [
  {
    name: 'a marked document is judged by the Tessera rules inside the shared validator',
    applies: has('validateStructured'),
    tests: ['tests/tessera/validation.test.ts', 'tests/tessera/superset.test.ts'],
    run(candidate) {
      for (const name of ['valid.yaml', 'notes-everywhere.yaml'])
        assert.deepEqual(
          issuesOf(() => candidate.validateStructured(parse(readDocument(name)))),
          [],
          name,
        );
      const codes = issuesOf(() => candidate.validateStructured(parse(readDocument('unknown-property.yaml')))).map(issue => issue.code);
      assert.deepEqual(codes, ['tessera-property']);
    },
  },
  {
    name: 'the marker counts only at the top level',
    applies: has('readMarker'),
    tests: ['tests/tessera/marker.test.ts'],
    run(candidate) {
      assert.deepEqual(candidate.readMarker({ tessera: 1 }), { family: 'tessera', revision: 1 });
      assert.deepEqual(candidate.readMarker({ ontology: [{ tessera: 1 }] }), { family: 'standard' });
      assert.equal(candidate.readMarker({ tessera: '1' }).family, 'invalid');
    },
  },
  {
    name: 'every refusal class gives its finding and a valid document gives none',
    applies: has('tesseraIssues'),
    tests: ['tests/tessera/validation.test.ts', 'tests/tessera/refusals.test.ts'],
    run(candidate) {
      for (const [name, expected] of Object.entries(EXPECTED_FINDINGS)) {
        const data = name.endsWith('.json') ? JSON.parse(readDocument(name)) : parse(readDocument(name));
        const found = candidate.tesseraIssues(data).issues.map((issue: { code: string; path: string }) => `${issue.code} ${issue.path}`);
        assert.deepEqual(found, expected, name);
      }
    },
  },
  {
    name: 'compiling removes the marker and every addition and records each loss',
    applies: has('compileDocument'),
    tests: ['tests/tessera/compile.test.ts'],
    run(candidate) {
      const source = readDocument('notes-everywhere.yaml');
      const result = candidate.compileDocument({ path: 'retail.ontology.yaml', source }, REGISTRY);
      assert.equal(result.ok, true);
      assert.equal(result.text.includes('tessera'), false);
      assert.equal(result.losses.length, 4);
    },
  },
  {
    name: 'the digest covers the compiler version and acceptance needs the exact digest or a listed property',
    applies: candidate => typeof candidate.acceptLoss === 'function' && typeof candidate.buildLossReport === 'function',
    tests: ['tests/tessera/loss-report.test.ts'],
    run(candidate) {
      const loss = { document: 'a.yaml', item: 'sw1:#ontology:A', property: 'tessera_notes', pointer: '/tessera_notes', bytes: 3, sha256: 'a'.repeat(64) };
      const subject = { compiler: { name: 'tessera', version: '1.0.0' }, base: { version: '0.2.0.dev0', label: 'x' }, lossPolicySha256: null, inputs: [], outputs: [], losses: [loss] };
      const report = candidate.buildLossReport(subject);
      assert.equal(report.compiler.version, '1.0.0');
      assert.notEqual(candidate.buildLossReport({ ...subject, compiler: { name: 'tessera', version: '1.0.1' } }).digest, report.digest);
      assert.deepEqual(candidate.acceptLoss(report, { digest: report.digest }), { accepted: 'digest' });
      assert.ok('refusal' in candidate.acceptLoss(report, { digest: 'sha256:' + 'b'.repeat(64) }));
      assert.ok('refusal' in candidate.acceptLoss(report, { policy: { policy: 1, allow: [] } }));
      assert.deepEqual(candidate.acceptLoss(report, { policy: { policy: 1, allow: ['tessera_notes'] } }), { accepted: 'policy' });
    },
  },
  {
    name: 'a unit compile checks outputs, refuses colliding paths and does not depend on file order',
    applies: has('compileUnit'),
    tests: ['tests/tessera/compile.test.ts', 'tests/tessera/determinism.test.ts'],
    run(candidate) {
      const faulty = { compileDocument: () => ({ ok: true, text: 'name: broken\nontology: []\n', data: {}, losses: [] }) };
      assert.ok(candidate.compileUnit(projectFiles, options, faulty).failures.some((failure: { code: string }) => failure.code === 'output-schema'));
      const lower = projectFiles.find(file => file.path === 'mapping.yaml')!;
      assert.ok(candidate.compileUnit([...projectFiles, { path: 'MAPPING.yaml', bytes: lower.bytes }], options).failures.some((failure: { code: string }) => failure.code === 'path-collision'));
      const forward = candidate.compileUnit(projectFiles, options);
      const backward = candidate.compileUnit([...projectFiles].reverse(), options);
      assert.deepEqual(
        backward.outputs.map((file: { path: string }) => file.path),
        forward.outputs.map((file: { path: string }) => file.path),
      );
      assert.equal(backward.report.digest, forward.report.digest);
    },
  },
  {
    name: 'a snapshot holds only committed bytes of commits on the default branch',
    applies: has('readSnapshot'),
    tests: ['tests/tessera/snapshot-source.test.ts'],
    async run(candidate) {
      const repository = createTesseraRepository();
      try {
        const offBranch = repository.addPersonalBranch('personal/someone');
        repository.editWithoutCommit(`${PROJECT_FOLDER}/ontology.yaml`, ONTOLOGY_TEXT + '# uncommitted\n');
        const source = await candidate.readSnapshot({ repository: repository.directory, projectFolder: PROJECT_FOLDER });
        const ontology = source.files.find((file: { path: string }) => file.path === 'ontology.yaml');
        assert.equal(new TextDecoder().decode(ontology.bytes), ONTOLOGY_TEXT);
        await assert.rejects(candidate.readSnapshot({ repository: repository.directory, projectFolder: PROJECT_FOLDER, commit: offBranch }));
      } finally {
        repository.dispose();
      }
    },
  },
  {
    name: 'a bundle goes to a temporary folder outside every source tree and is renamed whole',
    applies: has('writeBundle'),
    tests: ['tests/tessera/bundle-writer.test.ts'],
    run(candidate) {
      const base = mkdtempSync(join(tmpdir(), 'tessera-mutation-'));
      try {
        const repository = join(base, 'repository');
        mkdirSync(repository);
        const files = [{ path: 'manifest.json', bytes: encoder.encode('{}\n') }];
        assert.throws(() => candidate.writeBundle({ folder: join(repository, 'dist'), repository }, files));
        assert.equal(existsSync(join(repository, 'dist')), false);
        const out = join(base, 'out');
        candidate.writeBundle({ folder: out, repository }, files);
        assert.deepEqual(readdirSync(out), ['manifest.json']);
        const interrupted = join(base, 'interrupted');
        const failing = () => {
          throw new Error('disk full');
        };
        assert.throws(() => candidate.writeBundle({ folder: interrupted, repository }, files, failing), /disk full/);
        assert.equal(existsSync(interrupted), false);
        assert.deepEqual(
          readdirSync(base).filter(name => name.startsWith('.interrupted')),
          [],
        );
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'a failed compile is never accepted, even with the right digest',
    applies: has('main'),
    tests: ['tests/tessera/cli.test.ts'],
    async run(candidate) {
      const repository = createTesseraRepository();
      const out = join(mkdtempSync(join(tmpdir(), 'tessera-mutation-out-')), 'bundle');
      try {
        const base = ['compile', '--repository', repository.directory, '--project-folder', PROJECT_FOLDER, '--out', out];
        let printed = '';
        await candidate.main(
          [...base, '--json'],
          (text: string) => (printed += text),
          () => {},
        );
        const digest = JSON.parse(printed).report.digest;
        repository.commitFile(`${PROJECT_FOLDER}/semantic-model.yaml`, 'version: 0.2.0.dev0\nname: broken\ndatasets: []\n');
        const status = await candidate.main(
          [...base, '--accept-loss', digest],
          () => {},
          () => {},
        );
        assert.equal(status, 1);
        assert.equal(existsSync(out), false);
      } finally {
        repository.dispose();
      }
    },
  },
  {
    name: 'agents never read the marker or an addition',
    applies: has('documentForAgents'),
    tests: ['tests/tessera/agent-and-access.test.ts'],
    run(candidate) {
      const data = parse(readDocument('notes-everywhere.yaml'));
      const seen = JSON.stringify(candidate.documentForAgents(data));
      assert.equal(seen.includes('tessera'), false);
      assert.equal(seen.includes('Ask finance'), false);
    },
  },
];

/** Runs every case that applies to the candidate and fails when none does, so a mutant of a module no case covers cannot survive unseen. */
export async function tesseraCase(candidate: Candidate) {
  const matching = TESSERA_CASES.filter(entry => entry.applies(candidate));
  assert.ok(matching.length > 0, 'No Tessera case applies to this module.');
  for (const entry of matching) await entry.run(candidate);
}
