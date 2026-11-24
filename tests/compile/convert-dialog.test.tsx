// Checks the conversion dialog: each state, the plain warning, that nothing is offered to a reader, that an unsaved or uncommitted file is explained, and that long paths wrap.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CompileFailure } from '../../src/app/compile/api';
import { ConvertDialog, conversionBlocker } from '../../src/app/compile/ConvertDialog';
import { CHANGED_MESSAGE, confirmConversion, startReview, type ConvertClient, type ConvertReview, type ConvertTarget } from '../../src/app/compile/use-convert';
import type { ProjectInfo } from '../../src/app/projects/api';
import { ValidationPanel } from '../../src/app/validation/ValidationPanel';
import { sha256Hex } from '../../src/shared/tessera/digest';
import { checkUnit } from '../../src/server/tessera/compile-service';
import type { UnitSource } from '../../src/server/tessera/unit-source';
import { ONTOLOGY_TEXT } from '../helpers/tessera-repository';

const PATH = 'retail.ontology.yaml';
const encoder = new TextEncoder();
const target: ConvertTarget = { path: PATH, source: ONTOLOGY_TEXT, hash: sha256Hex(encoder.encode(ONTOLOGY_TEXT)) };
const idle = () => {};

function project(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
  return { slug: 'retail', name: 'Retail', origin: '', repo: 'retail', folder: '', branch: 'main', ahead: 0, behind: 0, changes: 0, files: [], published: null, ...overrides };
}

const workingUnit = (text: string): UnitSource => ({
  read: async () => ({ files: [{ path: PATH, bytes: encoder.encode(text) }], label: { kind: 'working-copy', unpublished: true } }),
});

function failure(status: number, body: CompileFailure['body']): CompileFailure {
  return Object.assign(new Error(body.error ?? 'failed'), { status, body }) as CompileFailure;
}

function clientFor(text: string, convert: ConvertClient['convert'] = async () => ({ path: PATH, version: 'v', lossDigest: 'd' })): ConvertClient {
  return { check: (_project, source) => checkUnit(workingUnit(text), { source }), convert };
}

const render = (props: { gitState?: string; unsaved?: boolean; path?: string }) =>
  renderToStaticMarkup(
    <ConvertDialog project={project()} target={{ ...target, path: props.path ?? PATH }} gitState={props.gitState ?? 'clean'} unsaved={props.unsaved ?? false} onClose={idle} onConverted={idle} />,
  );

test('an unsaved file and an uncommitted file are explained in words, with no review and no convert button', () => {
  const unsaved = render({ unsaved: true });
  expect(unsaved).toContain('not saved');
  expect(unsaved).not.toContain('Convert to standard</button>');
  const dirty = render({ gitState: 'modified' });
  expect(dirty).toContain('Commit or discard');
  expect(conversionBlocker({ gitState: 'clean', unsaved: false })).toBeNull();
});

test('a clean saved file opens the review, which starts as a stable placeholder', () => {
  const html = render({});
  expect(html).toContain('Convert retail.ontology.yaml to standard Ossie');
  expect(html).toContain('Reviewing the conversion');
});

test('the review compares the file before and after and keeps only this file losses', async () => {
  const view = await startReview(clientFor(ONTOLOGY_TEXT), 'retail', target);
  expect(view.status).toBe('review');
  if (view.status !== 'review') return;
  expect(view.review.before).toBe(ONTOLOGY_TEXT);
  expect(view.review.after).not.toContain('tessera');
  expect(view.review.fileLosses.length).toBe(3);
  expect(view.review.report.digest).toMatch(/^sha256:/);
});

test('confirming sends the file version, the input hashes and the digest of the review on screen', async () => {
  const sent: unknown[] = [];
  const client = clientFor(ONTOLOGY_TEXT, async (_project, body) => {
    sent.push(body);
    return { path: PATH, version: 'v', lossDigest: body.accept.digest };
  });
  const view = await startReview(client, 'retail', target);
  if (view.status !== 'review') throw new Error('Expected a review.');
  const done = await confirmConversion(client, 'retail', target, view.review);
  expect(done).toEqual({ status: 'done', path: PATH });
  expect(sent).toEqual([{ path: PATH, baseHash: target.hash, inputs: view.review.inputs, accept: { digest: view.review.report.digest } }]);
});

test('a file that changed since the editor loaded it asks for a new review', async () => {
  const view = await startReview(clientFor(ONTOLOGY_TEXT + '# edited elsewhere\n'), 'retail', target);
  expect(view).toEqual({ status: 'changed', message: CHANGED_MESSAGE });
});

test('a conflict, a refusal with findings and any other failure each reach their own state', async () => {
  const review = (await startReview(clientFor(ONTOLOGY_TEXT), 'retail', target)) as { review: ConvertReview };
  const conflict = await confirmConversion(
    clientFor(ONTOLOGY_TEXT, async () => Promise.reject(failure(409, { error: 'digest-mismatch' }))),
    'retail',
    target,
    review.review,
  );
  expect(conflict).toEqual({ status: 'changed', message: CHANGED_MESSAGE });
  const findings = [{ document: PATH, severity: 'error', code: 'meaning', path: '/', message: 'No.' }];
  const refused = await confirmConversion(
    clientFor(ONTOLOGY_TEXT, async () => Promise.reject(failure(422, { error: 'refused', findings }))),
    'retail',
    target,
    review.review,
  );
  expect(refused).toEqual({ status: 'refused', findings });
  const dirty = await confirmConversion(
    clientFor(ONTOLOGY_TEXT, async () => Promise.reject(failure(409, { error: 'dirty', message: 'Commit or discard the changes first.' }))),
    'retail',
    target,
    review.review,
  );
  expect(dirty).toEqual({ status: 'error', message: 'Commit or discard the changes first.' });
});

test('the review names the rewrite, the backup and that nothing is committed or published', async () => {
  const source = readFileSync('src/app/compile/ConvertDialog.tsx', 'utf8');
  expect(source).toContain('Comments and layout may differ from before');
  expect(source).toContain('The committed version in Git is your backup');
  expect(source).toContain('Nothing is committed or published');
});

test('the conversion control is absent for a reader and present for an editor of a Tessera document', () => {
  const format = { family: 'tessera' as const, revision: 1, base: '0.2.0.dev0', baseLabel: 'x' };
  const panel = (offer: boolean) => renderToStaticMarkup(<ValidationPanel issues={[]} format={format} onCheckStandard={idle} onConvertToStandard={offer ? idle : undefined} />);
  expect(panel(true)).toContain('Convert to standard');
  expect(panel(false)).not.toContain('Convert to standard');
  expect(panel(false)).toContain('Check as standard Ossie');
});

test('a long path is shown whole in the title and the stylesheet lets it wrap', () => {
  const longPath = 'finance/regional-reporting/' + 'very-long-folder-name-'.repeat(8) + 'retail.ontology.yaml';
  expect(render({ path: longPath, unsaved: true })).toContain(longPath);
  const css = readFileSync('src/app/compile/compile.css', 'utf8');
  expect(css).toMatch(/\.convert-diff[^{]*\{[^}]*min-width: 0/s);
  expect(css).not.toContain('text-overflow');
});
