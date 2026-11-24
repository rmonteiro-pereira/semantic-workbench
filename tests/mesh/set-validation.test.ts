/** Verifies partial readers receive only findings for files they can read. */
import { expect, test } from 'bun:test';
import type { Issue } from '../../src/shared/validation/diagnostics';
import { readerView, requiredUnitFiles, setFindings, type UnitValidation } from '../../src/shared/tessera/set-validation';
import type { OntologyUnit } from '../../src/shared/tessera/unit-structure';

const root = 'ontology.yaml';
const privatePart = 'sensitive-prices.yaml';
const unit: OntologyUnit = {
  root: {
    path: root,
    data: {
      ontology: [],
      tessera_includes: [privatePart],
      tessera_exports: ['Pricing'],
    },
  },
  parts: [{ path: privatePart, data: { ontology: [{ concept: 'Pricing', extends: ['Wholesale'] }] } }],
};

const singleIssue: Issue = { severity: 'error', code: 'schema', path: '/version', message: 'A version is required.' };
const hiddenIssue: Issue = { severity: 'error', code: 'schema', path: '/ontology/0', message: 'Wholesale pricing definition.' };
const report: UnitValidation = {
  requiredFiles: requiredUnitFiles(unit),
  providerInterfacesReadable: true,
  singleFile: new Map([
    [root, [singleIssue]],
    [privatePart, [hiddenIssue]],
  ]),
  set: setFindings(unit, []),
};

test('a complete reader can see both sorts of findings', () => {
  const view = readerView(report, new Set([root, privatePart]));
  expect(view.setNotChecked).toBe(false);
  expect(view.set).toMatchObject([{ code: 'tessera-export-open' }]);
  expect(view.singleFile[privatePart]).toEqual([hiddenIssue]);
});

test('a hidden file and a missing file give identical partial views', () => {
  const visible = new Set([root]);
  const missingUnit = { ...unit, parts: [] };
  const hidden = readerView(report, visible);
  const missing = readerView(
    {
      ...report,
      requiredFiles: requiredUnitFiles(missingUnit),
      singleFile: new Map([[root, [singleIssue]]]),
      set: setFindings(missingUnit, []),
    },
    visible,
  );
  expect(hidden).toEqual({ singleFile: { [root]: [singleIssue] }, set: [], setNotChecked: true });
  expect(JSON.stringify(hidden)).toBe(JSON.stringify(missing));
});

test('a missing provider interface also withholds all set findings', () => {
  const view = readerView({ ...report, providerInterfacesReadable: false }, new Set([root, privatePart]));
  expect(view.setNotChecked).toBe(true);
  expect(view.set).toEqual([]);
});
