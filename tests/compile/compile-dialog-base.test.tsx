// Checks the compile dialog names the base the project's report declares: today's sentence for 0.2 and before a report, the draft label for a 0.3 report.
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompileDialog, CompileIntro } from '../../src/app/compile/CompileDialog';
import { reportBaseOf, viewOfPublishedCheck, type CompileView } from '../../src/app/compile/use-compile';
import type { ProjectInfo } from '../../src/app/projects/api';
import { SUPPORTED_BASES } from '../../src/shared/tessera/bases';

const TODAY = 'Compiles the Tessera documents of this project to standard Ossie. Output is valid against the bundled Ossie 0.2.0.dev0 draft. Your files are not changed.';
const draftBase = { version: '0.3.0.dev0', label: SUPPORTED_BASES[1].label };
const oldBase = { version: '0.2.0.dev0', label: SUPPORTED_BASES[0].label };
const project = {
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
  published: { branch: 'main', commit: 'a'.repeat(40) },
} as ProjectInfo;
const text = (html: string) => html.replace(/<[^>]+>/g, '');

test('before a report arrives the dialog says exactly what it said before the draft base', () => {
  expect(text(renderToStaticMarkup(<CompileDialog project={project} onClose={() => {}} />))).toContain(TODAY);
});

test('a 0.2 report keeps exactly today’s sentence, and a 0.3 report names the Ossie 0.3.0 draft', () => {
  expect(text(renderToStaticMarkup(<CompileIntro reportBase={oldBase} />))).toBe(TODAY);
  const draft = text(renderToStaticMarkup(<CompileIntro reportBase={draftBase} />));
  expect(draft).toContain('Output is valid against the bundled Ossie 0.3.0 draft.');
  expect(renderToStaticMarkup(<CompileIntro reportBase={draftBase} />)).toMatch(/^<p class="dialog-intro">/);
});

test('every view that carries a report gives its base to the dialog', () => {
  const answer: any = { result: 'clean', source: { kind: 'published-snapshot', commit: 'c'.repeat(40) }, files: [{ path: 'a.yaml', treatment: 'compiled' }], report: { digest: 'd', base: draftBase } };
  expect(reportBaseOf(viewOfPublishedCheck(answer))).toEqual(draftBase);
  expect(reportBaseOf(viewOfPublishedCheck({ ...answer, files: [] }))).toEqual(draftBase);
  expect(reportBaseOf({ status: 'needs-acceptance', commit: 'c', report: { base: draftBase } } as CompileView)).toEqual(draftBase);
  expect(reportBaseOf({ status: 'loading', step: 'checking' })).toBeUndefined();
});
