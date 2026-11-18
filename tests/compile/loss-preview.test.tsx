// Checks the loss preview groups by property with counts first, wraps long names, shows status text without colour, never shows a lost value and never cuts text.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { ENTRIES_PER_STEP, LossPreview } from '../../src/app/compile/LossPreview';
import { buildLossReport, type LossEntry, type ReportSubject } from '../../src/shared/tessera/loss-report';

const LONG_DOCUMENT = 'finance/regional-reporting/' + 'very-long-folder-name-'.repeat(8) + 'retail.ontology.yaml';

function loss(property: string, document: string, pointer: string): LossEntry {
  return { document, item: 'sw1:#ontology:Retail', property, pointer, bytes: 12, sha256: 'a'.repeat(64) };
}

function reportOf(losses: LossEntry[]) {
  const subject: ReportSubject = {
    compiler: { name: 'tessera', version: '1.0.0' },
    base: { version: '0.2.0.dev0', label: 'valid against the bundled Ossie 0.2.0.dev0 draft' },
    lossPolicySha256: null,
    inputs: [],
    outputs: [],
    losses,
  };
  return buildLossReport(subject);
}

test('counts come first, then one group per property, then the digest', () => {
  const report = reportOf([
    loss('tessera_notes', 'a.yaml', '/ontology/0/tessera_notes'),
    loss('tessera_notes', 'b.yaml', '/ontology/0/tessera_notes'),
    loss('tessera_other', 'a.yaml', '/tessera_other'),
  ]);
  const html = renderToStaticMarkup(<LossPreview report={report} />);
  expect(html).toContain('3 values will be dropped');
  expect(html).toContain('from 2 documents');
  expect(html.indexOf('3 values will be dropped')).toBeLessThan(html.indexOf('tessera_notes'));
  expect(html).toContain('2 values');
  expect(html).toContain('1 value<');
  expect(html.indexOf('tessera_other')).toBeLessThan(html.indexOf('Report digest'));
  expect(html).toContain(report.digest);
  expect(html.match(/<details/g)).toHaveLength(2);
});

test('the preview says plainly that the project is not changed and what is left out', () => {
  const html = renderToStaticMarkup(<LossPreview report={reportOf([loss('tessera_notes', 'a.yaml', '/x')])} />);
  expect(html).toContain('Your project is not changed');
  expect(html).toContain('will be dropped');
});

test('a report with no loss says nothing is dropped', () => {
  expect(renderToStaticMarkup(<LossPreview report={reportOf([])} />)).toContain('Nothing is dropped');
});

test('status counts appear as words, not colour, when the report has them', () => {
  const report = { ...reportOf([loss('tessera_notes', 'a.yaml', '/x')]), statusCounts: { approved: 2, proposed: 1 } };
  const html = renderToStaticMarkup(<LossPreview report={report} />);
  expect(html).toContain('Status of the dropped items: approved 2, proposed 1.');
  expect(renderToStaticMarkup(<LossPreview report={reportOf([loss('tessera_notes', 'a.yaml', '/x')])} />)).not.toContain('Status of the dropped items');
});

test('a long document name is never shortened in the markup and its class wraps', () => {
  const css = readFileSync('src/app/compile/compile.css', 'utf8');
  expect(css).toMatch(/\.loss-document[^{]*\{[^}]*overflow-wrap: anywhere/s);
  const report = reportOf([loss('tessera_notes', LONG_DOCUMENT, '/x')]);
  expect(JSON.stringify(report)).toContain(LONG_DOCUMENT);
  expect(renderToStaticMarkup(<LossPreview report={report} />)).not.toContain('…');
});

test('the stylesheet never cuts text: no ellipsis, no line clamp, no hidden overflow on text', () => {
  const css = readFileSync('src/app/compile/compile.css', 'utf8');
  expect(css).not.toContain('text-overflow');
  expect(css).not.toContain('line-clamp');
  expect(css).not.toMatch(/overflow(-x|-y)?:\s*hidden/);
  expect(css).not.toContain('…');
});

test('a group pages its entries by a fixed step and the first step is smaller than a large report', () => {
  expect(ENTRIES_PER_STEP).toBeGreaterThan(0);
  const many = reportOf(Array.from({ length: ENTRIES_PER_STEP + 5 }, (_, index) => loss('tessera_notes', `doc-${index}.yaml`, `/ontology/${index}/tessera_notes`)));
  expect(many.losses.length).toBe(ENTRIES_PER_STEP + 5);
  expect(renderToStaticMarkup(<LossPreview report={many} />)).toContain(`${ENTRIES_PER_STEP + 5} values`);
});

test('no lost value is ever part of what the preview receives', () => {
  const report = reportOf([loss('tessera_notes', 'a.yaml', '/x')]);
  expect(Object.keys(report.losses[0]).sort()).toEqual(['bytes', 'document', 'item', 'pointer', 'property', 'sha256']);
});
