import { expect, test } from 'bun:test';
import { contrastRatio, parseColor } from '../../scripts/helpers/color-literals';

function token(section: string, name: string) {
  const value = section.match(new RegExp(`--color-${name}:\\s*([^;]+)`))?.[1];
  const color = value && parseColor(value);
  if (!color) throw new Error(`Missing theme token ${name}.`);
  return color;
}

test('unpublished marks keep AA text and outline contrast in both themes', async () => {
  const theme = await Bun.file('src/shared/theme/theme.css').text();
  const css = await Bun.file('src/app/item-diff/item-diff.css').text();
  expect(css).toContain('color: var(--color-text)');
  expect(css).toContain('background: var(--color-surface-sunken)');
  expect(css).toContain('outline: 2px dashed var(--color-text-muted)');
  const light = theme.slice(theme.indexOf(':root {'), theme.indexOf('}', theme.indexOf(':root {')));
  const dark = theme.slice(theme.indexOf(":root[data-theme='dark']"));
  for (const section of [light, dark]) {
    const background = token(section, 'surface-sunken');
    const outline = token(section, 'text-muted');
    expect(contrastRatio(token(section, 'text'), background)).toBeGreaterThanOrEqual(4.5);
    for (const surface of [background, token(section, 'surface'), token(section, 'surface-page')]) {
      expect(contrastRatio(outline, surface)).toBeGreaterThanOrEqual(3);
    }
  }
});
