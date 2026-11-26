// Checks the wording and cues of the conversion and draft screens: no ellipsis, a line that explains the conversion, the draft base named beside the counts, signs on a phone diff, and no bare "/" location.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { Findings } from '../../src/app/compile/CompileDialog';
import { ConvertDialog } from '../../src/app/compile/ConvertDialog';
import type { ProjectInfo } from '../../src/app/projects/api';
import { ValidationPanel, baseLabelFor } from '../../src/app/validation/ValidationPanel';

const project = {
  slug: 'sales',
  name: 'Sales draft',
  origin: '',
  repo: 'sales',
  folder: '',
  branch: 'main',
  ahead: 0,
  behind: 0,
  changes: 0,
  files: [],
  published: { branch: 'main', commit: 'a'.repeat(40) },
} as ProjectInfo;
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const draftSource = readFileSync('tests/fixtures/ossie-0.3/sales.semantic.yaml', 'utf8');
const oldSource = readFileSync('public/examples/billing/billing.semantic.yaml', 'utf8');

test('the conversion review loads without an ellipsis', () => {
  const html = text(
    renderToStaticMarkup(<ConvertDialog project={project} target={{ path: 'a.yaml', source: 'x', hash: 'h' }} gitState="clean" unsaved={false} onClose={() => {}} onConverted={() => {}} />),
  );
  expect(html).toContain('Reviewing the conversion');
  expect(html).not.toContain('…');
});

test('the conversion button of a 0.2.0.dev0 file says what it does under it', () => {
  const html = text(renderToStaticMarkup(<ValidationPanel issues={[]} source={oldSource} onConvertToDraftBase={() => {}} />));
  expect(html).toContain(
    'Convert to Ossie 0.3.0 draft This file declares Ossie 0.2.0.dev0. Converting rewrites it for the Ossie 0.3.0 draft base, and you review every change before anything is applied.',
  );
});

test('a 0.3.0.dev0 file names the draft base beside its counts, and a 0.2 file shows no new label', () => {
  expect(text(renderToStaticMarkup(<ValidationPanel issues={[]} source={draftSource} />))).toContain('Ossie 0.3.0 draft · 0 errors · 0 warnings');
  expect(baseLabelFor(undefined, oldSource)).toBe('');
  expect(baseLabelFor({ family: 'tessera', revision: 1, base: '0.3.0.dev0', baseLabel: '' }, draftSource)).toBe('Tessera 1 on Ossie 0.3.0 draft · ');
  expect(baseLabelFor({ family: 'tessera', revision: 1, base: '0.2.0.dev0', baseLabel: '' }, oldSource)).toBe('Tessera 1 on Ossie 0.2.0.dev0 · ');
});

test('on a phone the conversion diff signs each removed and added line, not only colours it', () => {
  const css = readFileSync('src/app/compile/compile.css', 'utf8');
  expect(css).toMatch(/\.convert-diff \.diff-additions-only \.cm-deletedChunk \.cm-deletedLine::before \{\s*content: '− ';/);
  expect(css).toMatch(/\.convert-diff \.diff-additions-only \.cm-line\.cm-changedLine::before \{\s*content: '\+ ';/);
});

test('a finding names its path only when the path is more than the document root', () => {
  const finding = { document: 'retail.ontology.yaml', severity: 'error' as const, code: 'schema', message: 'Broken.' };
  expect(text(renderToStaticMarkup(<Findings findings={[{ ...finding, path: '/' }]} />))).not.toContain('retail.ontology.yaml · /');
  expect(text(renderToStaticMarkup(<Findings findings={[{ ...finding, path: '/' }]} />))).toContain('retail.ontology.yaml');
  expect(text(renderToStaticMarkup(<Findings findings={[{ ...finding, path: '/ontology/0' }]} />))).toContain('retail.ontology.yaml · /ontology/0');
});
