// The test DOM has no layout, so these checks read the stylesheets: the reading sentence must take the same face,
// size, line height, padding and border as the Name input beside it, and the input frame must not make fields taller.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const TEXT_INPUT = "input:not([type='checkbox'], [type='radio'], [type='range'], [type='color'])";

/** The declarations of the rule whose selector list is exactly the given text, as a property-to-value map. */
function declarations(file: string, selector: string) {
  const css = readFileSync(file, 'utf8');
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`No rule for ${selector} in ${file}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const values = new Map<string, string>();
  for (const declaration of body.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    values.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
  }
  return values;
}

test('one line of the reading sentence is exactly as tall as the Name input, in the same face', () => {
  const dialogInput = declarations('src/app/style.css', '.workbench-dialog input,\n.workbench-dialog select');
  const fieldInput = declarations('src/app/edit/edit.css', `.item-fields ${TEXT_INPUT},\n.item-fields select`);
  const reading = declarations('src/app/attributes/attributes.css', '.item-fields .attribute-reading textarea');
  expect(reading.get('field-sizing')).toBe('content');
  expect(reading.get('min-height')).toBe('0');
  expect(reading.get('margin-top')).toBe('0');
  // Inputs keep the browser's system face and normal line height, so the textarea names both.
  expect(reading.get('font-family')).toBe('system-ui, sans-serif');
  expect(reading.get('line-height')).toBe('normal');
  expect(reading.get('font-size')).toBe(declarations('src/app/edit/edit.css', `.item-fields input:not([type='checkbox']),\n.item-fields select,\n.item-fields textarea`).get('font-size'));
  expect(reading.get('padding')).toBe(dialogInput.get('padding'));
  expect(reading.get('border')).toBe(fieldInput.get('border'));
  expect(reading.get('border-radius')).toBe(fieldInput.get('border-radius'));
});

test('the input frame changes the border only, so panel fields keep their height', () => {
  const frame = declarations('src/app/edit/edit.css', `.item-fields ${TEXT_INPUT},\n.item-fields select`);
  expect(frame.get('border')).toBe('1px solid var(--color-border)');
  expect(frame.has('padding')).toBe(false);
  expect(frame.has('height')).toBe(false);
  // The browser's 2px inset border becomes 1px, and that pixel goes back into the padding.
  const panelInput = declarations('src/app/edit/edit.css', `.item-fields ${TEXT_INPUT}:not(.workbench-dialog *)`);
  expect(panelInput.get('padding')).toBe('2px 3px');
});
