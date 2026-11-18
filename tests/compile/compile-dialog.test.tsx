// Checks the dialog for each state, that every action is a named native button, that the base label and the not-approval note are on screen, and that nothing is added to the screens that do not use it.
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompileDialog, CompileFooter, CompileViewBody, publishedUnavailableReason } from '../../src/app/compile/CompileDialog';
import type { CompileControl, CompileView } from '../../src/app/compile/use-compile';
import { ExportDialog } from '../../src/app/projects/ExportDialog';
import type { ProjectInfo } from '../../src/app/projects/api';
import { ValidationPanel } from '../../src/app/validation/ValidationPanel';
import { buildLossReport } from '../../src/shared/tessera/loss-report';
import type { DocumentFormat } from '../../src/shared/tessera/format';

const COMMIT = 'a'.repeat(40);
const report = buildLossReport({
  compiler: { name: 'tessera', version: '1.0.0' },
  base: { version: '0.2.0.dev0', label: 'valid against the bundled Ossie 0.2.0.dev0 draft' },
  lossPolicySha256: null,
  inputs: [],
  outputs: [],
  losses: [{ document: 'retail.ontology.yaml', item: 'sw1:#ontology:Retail', property: 'tessera_notes', pointer: '/ontology/0/tessera_notes', bytes: 9, sha256: 'b'.repeat(64) }],
});

function project(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    slug: 'retail',
    name: 'Retail',
    origin: '',
    repo: 'retail',
    folder: '',
    branch: 'main',
    ahead: 0,
    behind: 0,
    changes: 0,
    files: [],
    published: { branch: 'main', commit: COMMIT },
    ...overrides,
  };
}

const idle = () => {};
function control(view: CompileView): CompileControl {
  return { view, accept: idle, retry: idle, download: idle };
}

const render = (view: CompileView) => renderToStaticMarkup(<CompileViewBody view={view} />);
const footer = (view: CompileView, source: 'published' | 'working' = 'published') => renderToStaticMarkup(<CompileFooter control={control(view)} source={source} onClose={idle} />);

test('loading shows a placeholder that says what is happening', () => {
  expect(render({ status: 'loading', step: 'checking' })).toContain('Checking the project');
  expect(render({ status: 'loading', step: 'downloading' })).toContain('Preparing the download');
});

test('an unavailable project says why in words', () => {
  expect(render({ status: 'unavailable', reason: 'This project has not been published yet.' })).toContain('This project has not been published yet.');
});

test('a refused compile lists every finding with its document and path', () => {
  const html = render({
    status: 'refused',
    source: { kind: 'published-snapshot', commit: COMMIT },
    findings: [{ document: 'retail.ontology.yaml', severity: 'error', code: 'meaning', path: '/ontology/0', message: 'The meaning changed.' }],
  });
  expect(html).toContain('retail.ontology.yaml');
  expect(html).toContain('/ontology/0');
  expect(html).toContain('The meaning changed.');
  expect(html).toContain('Fix these findings first');
});

test('a loss that needs acceptance shows the preview and says accepting is not approval', () => {
  const html = render({ status: 'needs-acceptance', commit: COMMIT, report });
  expect(html).toContain('1 value will be dropped');
  expect(html).toContain('Accepting a report is not approval of the content');
  expect(html).toContain(report.digest);
});

test('a changed report shows its notice before the new preview', () => {
  const html = render({ status: 'needs-acceptance', commit: COMMIT, report, notice: 'The project changed after you reviewed the report.' });
  expect(html.indexOf('The project changed')).toBeLessThan(html.indexOf('will be dropped'));
});

test('ready, released and nothing to do each name the next step', () => {
  expect(render({ status: 'ready', commit: COMMIT, digest: report.digest })).toContain('ready to download');
  expect(render({ status: 'released', commit: COMMIT, digest: report.digest })).toContain('Accepted');
  expect(render({ status: 'nothing-to-do', commit: COMMIT, digest: report.digest })).toContain('already standard Ossie');
});

test('an error is announced and offers Retry in the footer', () => {
  expect(render({ status: 'error', message: 'The request failed.' })).toContain('role="alert"');
  expect(footer({ status: 'error', message: 'x' })).toContain('Retry');
});

test('every action is a named native button, and accept and download appear only where they apply', () => {
  const accept = footer({ status: 'needs-acceptance', commit: COMMIT, report });
  expect(accept).toContain('Accept this report');
  expect(accept).not.toContain('Download zip');
  expect(footer({ status: 'released', commit: COMMIT, digest: report.digest })).toContain('Download zip');
  for (const html of [accept, footer({ status: 'ready', commit: COMMIT, digest: report.digest })]) {
    for (const button of html.match(/<button[^>]*>[^<]*<\/button>/g) ?? []) {
      expect(button).toContain('type="button"');
      expect(button.replace(/<[^>]+>/g, '').trim().length).toBeGreaterThan(0);
    }
  }
});

test('a working copy can be checked but never accepted or downloaded', () => {
  const html = footer({ status: 'needs-acceptance', commit: COMMIT, report }, 'working');
  expect(html).not.toContain('Accept this report');
  expect(html).not.toContain('Download zip');
});

test('the dialog names the base label, says it changes no file, and labels the working copy unpublished', () => {
  const published = renderToStaticMarkup(<CompileDialog project={project()} onClose={idle} />);
  expect(published).toContain('valid against the bundled Ossie 0.2.0.dev0 draft');
  expect(published).toContain('Your files are not changed');
  const working = renderToStaticMarkup(<CompileDialog project={project()} initialSource="working" onClose={idle} />);
  expect(working).toContain('Unpublished');
  expect(working).toContain('Nothing can be downloaded from it');
  expect(published).toContain('aria-label="Compile from"');
});

test('publishing and permission decide whether the published snapshot can be compiled', () => {
  expect(publishedUnavailableReason(project())).toBeNull();
  expect(publishedUnavailableReason(project({ published: null }))).toContain('not been published');
  expect(publishedUnavailableReason(project({ actions: ['read', 'edit'] }))).toContain('permission');
  expect(publishedUnavailableReason(project({ actions: ['read', 'export'] }))).toBeNull();
});

const tessera: DocumentFormat = { family: 'tessera', revision: 1, base: '0.2.0.dev0', baseLabel: 'x' };
const panel = (format: DocumentFormat | undefined, withActions: boolean) =>
  renderToStaticMarkup(<ValidationPanel issues={[]} format={format} onCheckStandard={withActions ? idle : undefined} onConvertToStandard={withActions ? idle : undefined} />);

test('the panel offers the two controls only for a Tessera document that is given the actions', () => {
  expect(panel(tessera, true)).toContain('Check as standard Ossie');
  expect(panel(tessera, true)).toContain('Convert to standard');
  expect(panel(tessera, false)).not.toContain('standard Ossie');
  expect(panel({ family: 'standard' }, true)).not.toContain('Check as standard Ossie');
  expect(panel(undefined, true)).not.toContain('Convert to standard');
});

test('the export dialog gains one option and no control until it is chosen', () => {
  const html = renderToStaticMarkup(<ExportDialog project={project()} dirty={null} saveOpenFile={async () => {}} onClose={idle} onDone={idle} />);
  expect(html).toContain('Standard Ossie (compiled)');
  expect(html).not.toContain('Review standard Ossie');
  const buttons = (html.match(/<button/g) ?? []).length;
  expect(buttons).toBe(2);
});
