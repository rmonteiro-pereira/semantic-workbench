// Checks the loss report counts lost governance entries by status, only when some are lost, inside the digest and without any value text.
import { expect, test } from 'bun:test';
import { parse } from 'yaml';
import { buildLossReport, printReport, type GovernanceStatusKey, type LossEntry } from '../../src/shared/tessera/loss-report';
import { compileUnit } from '../../src/shared/tessera/compile-unit';
import { ADDITIONS_PROJECT_FILES } from '../helpers/tessera-repository';

const encoder = new TextEncoder();
const options = { lossPolicySha256: null };

const loss = (pointer: string): LossEntry => ({
  document: 'retail/ontology.yaml',
  item: 'sw1:#ontology:Retail/concept:Order',
  property: 'tessera_governance',
  pointer,
  bytes: 20,
  sha256: 'a'.repeat(64),
});
const subject = {
  compiler: { name: 'tessera', version: '1.1.0' },
  base: { version: '0.2.0.dev0', label: 'valid against the bundled Ossie 0.2.0.dev0 draft' },
  lossPolicySha256: null,
  inputs: [],
  outputs: [],
  losses: [loss('/ontology/0/tessera_governance')],
};

function reportFor(statuses: GovernanceStatusKey[]) {
  return buildLossReport({ ...subject, governanceStatuses: statuses });
}

test('four statuses are counted with every key present and the keys sorted', () => {
  const report = reportFor(['approved', 'proposed', 'notSet', 'notSet']);
  expect(report.statusCounts).toEqual({ approved: 1, deprecated: 0, notSet: 2, proposed: 1 });
  expect(Object.keys(report.statusCounts!)).toEqual(['approved', 'deprecated', 'notSet', 'proposed']);
  expect(printReport(report)).toContain('"statusCounts": {\n    "approved": 1,\n    "deprecated": 0,\n    "notSet": 2,\n    "proposed": 1\n  }');
});

test('a report without lost governance has no status counts, not zeros', () => {
  const report = buildLossReport(subject);
  expect('statusCounts' in report).toBe(false);
  expect(printReport(report)).not.toContain('statusCounts');
  expect('statusCounts' in reportFor([])).toBe(false);
});

test('a changed status changes the digest', () => {
  expect(reportFor(['approved']).digest).not.toBe(reportFor(['proposed']).digest);
  expect(reportFor(['approved']).digest).toBe(reportFor(['approved']).digest);
});

test('the additions project reports its lost governance by status and no value text', () => {
  const files = Object.entries(ADDITIONS_PROJECT_FILES).map(([path, text]) => ({ path, bytes: encoder.encode(text) }));
  const result = compileUnit(files, options);
  expect(result.failures).toEqual([]);
  expect(result.report.reportVersion).toBe(2);
  expect(result.report.statusCounts).toEqual({ approved: 2, deprecated: 1, notSet: 0, proposed: 2 });
  const printed = printReport(result.report);
  for (const text of ['dana@example.com', 'Customers are modelled as accounts', 'Use the account concept']) expect(printed).not.toContain(text);
  expect(result.report.counts).toEqual({ tessera_ai_context: 2, tessera_attributes: 1, tessera_governance: 5 });
  expect(parse(printed).reportVersion).toBe(2);
});
