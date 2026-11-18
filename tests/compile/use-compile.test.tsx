// Checks each state of the compile dialog with a fake client: unavailable, nothing to do, refused, loss needs acceptance, ready, released, error, and that the digest sent is the one on screen.
import { expect, test } from 'bun:test';
import { CHANGED_NOTICE, NOT_PUBLISHED_REASON, SNAPSHOT_CHANGED_MESSAGE, acceptShownReport, startCheck, type CompileClient, type CompileView } from '../../src/app/compile/use-compile';
import type { CompileFailure } from '../../src/app/compile/api';
import { checkUnit, runCompile, type RunAnswer } from '../../src/server/tessera/compile-service';
import type { UnitSource } from '../../src/server/tessera/unit-source';
import { ONTOLOGY_TEXT, SEMANTIC_MODEL_TEXT } from '../helpers/tessera-repository';

const encoder = new TextEncoder();
const COMMIT = 'a'.repeat(40);
const LATER_COMMIT = 'b'.repeat(40);

function unitOf(files: Record<string, string>, commit = COMMIT): UnitSource {
  const place = { commit, branch: 'main', projectFolder: '.' };
  return {
    read: async kind => ({
      files: Object.entries(files).map(([path, text]) => ({ path, bytes: encoder.encode(text) })),
      label: kind === 'published' ? { kind: 'published-snapshot', commit, unpublished: false } : { kind: 'working-copy', unpublished: true },
      commit: kind === 'published' ? commit : undefined,
      place: kind === 'published' ? place : undefined,
    }),
  };
}

const withNotes = unitOf({ 'retail.ontology.yaml': ONTOLOGY_TEXT });
const standardOnly = unitOf({ 'model.yaml': SEMANTIC_MODEL_TEXT });
const defective = unitOf({ 'retail.ontology.yaml': ONTOLOGY_TEXT.replace('tessera: 1', 'tessera: 1\ntessera_unknown_property: yes') });
const tesseraNoNotes = unitOf({ 'plain.ontology.yaml': 'tessera: 1\nversion: 0.2.0.dev0\nname: Plain\nontology:\n  - concept: Order\n    type: EntityType\n' });

function failure(status: number, error: string): CompileFailure {
  return Object.assign(new Error(error), { status, body: { error } }) as CompileFailure;
}

type Calls = { run: { digest?: string; commit?: string }[] };

function clientOver(unit: UnitSource, options: { checkError?: Error; runAnswer?: () => Promise<RunAnswer> } = {}): { client: CompileClient; calls: Calls } {
  const calls: Calls = { run: [] };
  const client: CompileClient = {
    check: async (_project, source) => {
      if (options.checkError) throw options.checkError;
      return checkUnit(unit, { source });
    },
    run: async (_project, digest, commit) => {
      calls.run.push({ digest, commit });
      return options.runAnswer ? options.runAnswer() : runCompile(unit, { ...(digest ? { accept: { digest } } : {}), ...(commit ? { commit } : {}) });
    },
    download: async () => ({ blob: new Blob([]), fileName: 'x.zip' }),
  };
  return { client, calls };
}

async function viewOf(unit: UnitSource, source: 'published' | 'working' = 'published', options = {}): Promise<CompileView> {
  return startCheck(clientOver(unit, options).client, 'retail', source);
}

test('a project with nothing published is unavailable and says why in words', async () => {
  expect(await viewOf(withNotes, 'published', { checkError: failure(409, 'not-published') })).toEqual({ status: 'unavailable', reason: NOT_PUBLISHED_REASON });
});

test('no permission and a hidden file are unavailable with their own reasons', async () => {
  const noPermission = await viewOf(withNotes, 'published', { checkError: failure(403, 'Forbidden') });
  expect(noPermission).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('permission') });
  const hidden = await viewOf(withNotes, 'published', { checkError: failure(404, 'Not found.') });
  expect(hidden).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('could not be found') });
});

test('a project of standard files only has nothing to do and still offers the same bytes', async () => {
  expect(await viewOf(standardOnly)).toMatchObject({ status: 'nothing-to-do', commit: COMMIT });
});

test('a defect refuses the compile and lists the findings with their paths', async () => {
  const view = await viewOf(defective);
  expect(view.status).toBe('refused');
  if (view.status === 'refused') expect(view.findings.some(finding => finding.path.startsWith('/'))).toBe(true);
});

test('a loss needs acceptance and shows the report that was checked', async () => {
  const view = await viewOf(withNotes);
  expect(view).toMatchObject({ status: 'needs-acceptance', commit: COMMIT });
  if (view.status === 'needs-acceptance') expect(view.report.losses.length).toBeGreaterThan(0);
});

test('a Tessera document with nothing to drop is ready to download', async () => {
  expect(await viewOf(tesseraNoNotes)).toMatchObject({ status: 'ready', commit: COMMIT });
});

test('the working copy is only checked: it keeps its unpublished label and never offers to accept', async () => {
  const view = await viewOf(withNotes, 'working');
  expect(view.status).toBe('checked');
  if (view.status === 'checked') expect(view.answer.source).toEqual({ kind: 'working-copy', unpublished: true });
});

test('a failure the interface cannot explain is an error with the message', async () => {
  expect(await viewOf(withNotes, 'published', { checkError: failure(500, 'Boom') })).toEqual({ status: 'error', message: 'Boom' });
  expect(await viewOf(withNotes, 'published', { checkError: failure(413, 'The project holds 3 files, and the limit is 2.') })).toMatchObject({
    status: 'error',
    message: expect.stringContaining('too large'),
  });
});

test('accepting sends exactly the digest and commit on screen and releases', async () => {
  const { client, calls } = clientOver(withNotes);
  const shown = await startCheck(client, 'retail', 'published');
  if (shown.status !== 'needs-acceptance') throw new Error('Expected a report to accept.');
  const released = await acceptShownReport(client, 'retail', shown);
  expect(calls.run).toEqual([{ digest: shown.report.digest, commit: COMMIT }]);
  expect(released).toEqual({ status: 'released', commit: COMMIT, digest: shown.report.digest });
});

test('a digest that changed after the review is refused and the new report is shown with a notice', async () => {
  const { client } = clientOver(withNotes);
  const shown = await startCheck(client, 'retail', 'published');
  if (shown.status !== 'needs-acceptance') throw new Error('Expected a report to accept.');
  const changed = unitOf({ 'retail.ontology.yaml': ONTOLOGY_TEXT + '  - concept: Return\n    type: EntityType\n    tessera_notes: New note.\n' });
  const view = await acceptShownReport(clientOver(changed).client, 'retail', shown);
  expect(view.status).toBe('needs-acceptance');
  if (view.status !== 'needs-acceptance') return;
  expect(view.notice).toBe(CHANGED_NOTICE);
  expect(view.report.digest).not.toBe(shown.report.digest);
  expect(view.report.losses.length).toBe(shown.report.losses.length + 1);
});

test('a published commit that moved while accepting shows a fresh report with a notice', async () => {
  const moved = unitOf({ 'retail.ontology.yaml': ONTOLOGY_TEXT }, LATER_COMMIT);
  const { client } = clientOver(moved, { runAnswer: () => Promise.reject(failure(409, 'snapshot-changed')) });
  const shown = await startCheck(clientOver(withNotes).client, 'retail', 'published');
  if (shown.status !== 'needs-acceptance') throw new Error('Expected a report to accept.');
  const view = await acceptShownReport(client, 'retail', shown);
  expect(view).toMatchObject({ status: 'needs-acceptance', commit: LATER_COMMIT, notice: CHANGED_NOTICE });
});

test('a download that fails because the project moved says so in words', async () => {
  const view = await viewOf(withNotes, 'published', { checkError: failure(409, 'snapshot-changed') });
  expect(view).toEqual({ status: 'error', message: SNAPSHOT_CHANGED_MESSAGE });
});
