// Checks the validation panel names the Tessera format in its summary line and adds no control for a Tessera document.
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ValidationPanel } from '../../src/app/validation/ValidationPanel';
import { formatOfInspection } from '../../src/shared/tessera/format';
import { inspect } from '../../src/shared/core/model';
import type { Issue } from '../../src/shared/validation/diagnostics';
import { validateInput } from '../../src/shared/validation/input';

const TESSERA_SOURCE = 'tessera: 1\nversion: 0.2.0.dev0\nname: Retail\nontology:\n  - concept: Order\n    type: EntityType\n';
const STANDARD_SOURCE = 'version: 0.2.0.dev0\nname: Retail\nontology:\n  - concept: Order\n    type: EntityType\n';
const NOT_VALIDATED_SOURCE = 'version: 0.1.0\nname: Retail\nontology:\n  - concept: Order\n    type: EntityType\n';

function render(source: string, filename = 'retail.ontology.yaml') {
  const result = validateInput(source, filename);
  const format = result.valid ? formatOfInspection(result.model) : undefined;
  return renderToStaticMarkup(<ValidationPanel issues={result.issues} format={format} onValidateAsShippedVersion={() => {}} />);
}

test('a Tessera document shows its format in the summary line', () => {
  expect(render(TESSERA_SOURCE)).toContain('<p>Tessera 1 on Ossie 0.2.0.dev0 · 0 errors · 0 warnings</p>');
});

test('a Tessera document is never shown as not validated and offers no Validate as button', () => {
  const html = render(TESSERA_SOURCE);
  expect(html).not.toContain('Not validated');
  expect(html).not.toContain('Validate as');
});

test('a standard document keeps the old summary line', () => {
  expect(render(STANDARD_SOURCE)).toContain('<p>0 errors · 0 warnings</p>');
});

test('a document with an unknown Ossie version still shows the notice and the button', () => {
  const html = render(NOT_VALIDATED_SOURCE);
  expect(html).toContain('Not validated');
  expect(html).toContain('Validate as Ossie 0.2.0.dev0');
});

test('the Tessera panel has the same controls as the standard one', () => {
  const count = (html: string) => (html.match(/<button/g) ?? []).length;
  expect(count(render(TESSERA_SOURCE))).toBe(count(render(STANDARD_SOURCE)));
});

test('a Tessera finding shows how to fix it', () => {
  const issues: Issue[] = [{ severity: 'error', code: 'tessera-property', path: '/ontology/0/tessera_note', message: 'tessera_note is not a Tessera property.' }];
  const html = renderToStaticMarkup(<ValidationPanel issues={issues} />);
  expect(html).toContain('How to fix: Check the spelling against the registered properties');
});

test('inspection of a Tessera document supplies the format the panel prints', () => {
  expect(formatOfInspection(inspect(TESSERA_SOURCE, 'retail.ontology.yaml'))).toMatchObject({ family: 'tessera', revision: 1, base: '0.2.0.dev0' });
});
