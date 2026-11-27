// Checks the conversion option for a 0.2 document: offered only when asked for, a preview of every change, a confirmation that sends the previewed hash, and stale answers asking for a new review.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { BaseChanges, BaseConvertDialog, BaseConvertFooter } from '../../src/app/compile/ConvertDialog';
import { confirmBaseConversion, reviewSavedFile, startBaseReview, type BaseConvertView } from '../../src/app/compile/use-convert';
import type { ProjectInfo } from '../../src/app/projects/api';
import { ValidationPanel } from '../../src/app/validation/ValidationPanel';

const source = readFileSync('public/examples/billing/billing.mapping.yaml', 'utf8');
const target = { path: 'billing.mapping.yaml', source, hash: 'a'.repeat(64) };
const project = { slug: 'billing', name: 'Billing', origin: '', repo: 'billing', folder: '', branch: 'main', ahead: 0, behind: 0, changes: 0, files: [], published: null } as unknown as ProjectInfo;
const text = (html: string) => html.replace(/<[^>]+>/g, ' ');

test('the validation panel offers the conversion only when it is given the action', () => {
  expect(renderToStaticMarkup(<ValidationPanel issues={[]} />)).not.toContain('Convert to Ossie 0.3.0 draft');
  expect(renderToStaticMarkup(<ValidationPanel issues={[]} onConvertToDraftBase={() => {}} />)).toContain('Convert to Ossie 0.3.0 draft');
});

test('the preview lists every change of the file, each at its place', () => {
  const view = startBaseReview(target);
  if (view.status !== 'review') throw new Error('expected a review');
  expect(view.review.before).toBe(source);
  const html = text(renderToStaticMarkup(<BaseChanges review={view.review} />));
  expect(html).toContain('/version');
  expect(html).toContain('0.2.0.dev0 → 0.3.0.dev0');
  expect(html).toContain('custom_extensions → nonportable_extensions');
  expect(view.review.changes.map(change => change.kind)).toEqual(['version', 'extension-list', 'extension-data']);
});

test('a file with uncommitted or unsaved changes is explained instead of previewed', () => {
  expect(text(renderToStaticMarkup(<BaseConvertDialog project={project} target={target} gitState="modified" unsaved={false} onClose={() => {}} onConverted={() => {}} />))).toContain('not committed');
  expect(text(renderToStaticMarkup(<BaseConvertDialog project={project} target={target} gitState="clean" unsaved onClose={() => {}} onConverted={() => {}} />))).toContain('not saved');
});

test('a document that does not declare 0.2.0.dev0 is refused in the preview', () => {
  expect(startBaseReview({ ...target, source: source.replace('version: 0.2.0.dev0', 'version: 0.3.0.dev0') }).status).toBe('refused');
});

test('the confirmation sends the previewed hash, and a stale answer asks for a new review', async () => {
  const view = startBaseReview(target);
  if (view.status !== 'review') throw new Error('expected a review');
  const sent: unknown[] = [];
  const done = await confirmBaseConversion(
    { convertBase: async (_project, body) => (sent.push(body), { path: body.path, version: 'b'.repeat(64), converted: body.converted }) },
    'billing',
    target,
    view.review,
  );
  expect(done).toEqual({ status: 'done', path: target.path });
  expect(sent).toEqual([{ path: target.path, baseHash: target.hash, converted: view.review.converted }]);
  const stale = Object.assign(new Error('changed'), { status: 409, body: { error: 'version-changed' } });
  const changed = await confirmBaseConversion({ convertBase: async () => Promise.reject(stale) }, 'billing', target, view.review);
  expect(changed.status).toBe('changed');
});

test('a stale or failed confirmation offers Review again, and a review in progress does not', () => {
  const footer = (view: BaseConvertView) => text(renderToStaticMarkup(<BaseConvertFooter control={{ view, convert: () => {}, reload: () => {} }} confirmed onClose={() => {}} />));
  expect(footer({ status: 'changed', message: 'changed' })).toContain('Review again');
  expect(footer({ status: 'error', message: 'failed' })).toContain('Review again');
  const view = startBaseReview(target);
  if (view.status !== 'review') throw new Error('expected a review');
  expect(footer(view)).not.toContain('Review again');
});

test('Review again previews the file as it is saved now, and the confirmation names that version', async () => {
  const edited = source.replace('name:', '# edited\nname:');
  const read = await reviewSavedFile({ file: async (_project, path) => ({ path, source: edited, hash: 'c'.repeat(64) }) }, 'billing', target.path);
  expect(read.target).toEqual({ path: target.path, source: edited, hash: 'c'.repeat(64) });
  if (read.view.status !== 'review') throw new Error('expected a review');
  expect(read.view.review.before).toBe(edited);
  const failed = await reviewSavedFile({ file: async () => Promise.reject(new Error('offline')) }, 'billing', target.path);
  expect(failed).toEqual({ view: { status: 'error', message: 'offline' } });
});
