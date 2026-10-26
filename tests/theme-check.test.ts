// The theme check finds colour literals outside the theme files, and the codemod moves them in.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { contrastRatio, parseColor } from '../scripts/helpers/color-literals';
import { themeViolations, violationsIn } from '../scripts/check-theme';
import { mapLiteral, readTokens, rewriteText } from '../scripts/theme-codemod';
import { themedFiles } from '../scripts/helpers/theme-files';

const fixture = (name: string) => readFileSync(`tests/fixtures/theme/${name}`, 'utf8');
const tokens = readTokens(readFileSync('src/theme/theme.css', 'utf8'));

test('the check reports each literal of a stylesheet with its line and ignores comments', () => {
  const found = violationsIn('src/fixture.css', fixture('leaky.css'));
  expect(found.map(item => `${item.line}:${item.literal}`)).toEqual([
    '4:#ffffff',
    '5:rgba(23, 50, 58, 0.2)',
    '6:red',
    '9:#17323a14',
  ]);
});

test('the check accepts tokens, currentColor, transparent, gradients and id selectors', () => {
  expect(violationsIn('src/fixture.css', fixture('clean.css'))).toEqual([]);
});

test('the check finds literals in script strings and not in prose or comments', () => {
  const found = violationsIn('src/fixture.tsx', fixture('leaky.tsx'));
  expect(found.map(item => `${item.line}:${item.literal}`)).toEqual([
    '2:#2a6c95',
    '4:rgba(36,124,102,0.2)',
    '6:#243936',
    '6:white',
  ]);
});

test('the check skips the theme files and generated code', () => {
  expect(violationsIn('src/theme/theme.css', 'a{color:#fff}')).toEqual([]);
  expect(violationsIn('src/generated/schema.ts', "const x = '#fff';")).toEqual([]);
});

test('the source tree holds no colour literal outside the theme files', () => {
  expect(themeViolations().map(item => `${item.file}:${item.line} ${item.literal}`)).toEqual([]);
});

test('the codemod maps a literal to the token of its job', () => {
  const background = mapLiteral('#fff', 'background', tokens);
  const text = mapLiteral('#fff', 'color', tokens);
  expect(background.ok && background.token).toBe('--color-surface');
  expect(text.ok && text.token).toBe('--color-on-accent');
});

test('the codemod keeps transparency as color-mix and leaves far colours alone', () => {
  const shadow = mapLiteral('#17323a14', 'box-shadow', tokens);
  expect(shadow.ok && shadow.replacement).toBe(
    'color-mix(in srgb, var(--color-shadow) 8%, transparent)',
  );
  expect(mapLiteral('#ff00ff', 'color', tokens).ok).toBe(false);
});

test('a second codemod run changes nothing', () => {
  const source = { text: fixture('leaky.css'), language: 'css' as const, file: 'a.css' };
  const first = rewriteText(source, tokens);
  expect(first.text).not.toContain('#ffffff');
  const second = rewriteText({ ...source, text: first.text }, tokens);
  // Only the colour the theme has no token for is left, and it stays untouched.
  expect(second.changes.map(change => change.literal.text)).toEqual(['red']);
  expect(second.text).toBe(first.text);
});

test('the sign-in stylesheet carries the theme tokens and uses them for every colour', async () => {
  const { authStylesheet } = await import('../src/server/routes/auth-stylesheet');
  const css = authStylesheet();
  expect(css).toContain('--color-surface:');
  expect(css).toContain('background:var(--color-surface-page)');
  expect(violationsIn('src/auth.css', css.slice(css.indexOf('body{')))).toEqual([]);
});

const themeCss = readFileSync('src/theme/theme.css', 'utf8');

// The value of each `--color-*: #hex;` declaration inside one block of the theme file.
function tokenValues(block: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const match of block.matchAll(/(--color-[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    values.set(match[1], match[2].toLowerCase());
  }
  return values;
}

const lightBlock = themeCss.slice(themeCss.indexOf(':root {'), themeCss.indexOf('@media'));
const mediaBlock = themeCss.slice(
  themeCss.indexOf('@media'),
  themeCss.indexOf(":root[data-theme='dark']"),
);
const dataThemeBlock = themeCss.slice(themeCss.indexOf(":root[data-theme='dark']"));
const light = tokenValues(lightBlock);
const dark = tokenValues(dataThemeBlock);

test('the dark set has the same tokens as the light set that hold a value', () => {
  expect([...dark.keys()].sort()).toEqual([...light.keys()].sort());
});

test('the system dark block and the chosen dark block hold the same values', () => {
  expect(tokenValues(mediaBlock)).toEqual(dark);
  expect(mediaBlock).toContain(":root:not([data-theme='light'])");
});

test('every token a stylesheet or component refers to is defined in the theme', () => {
  const defined = new Set(themeCss.match(/--color-[\w-]+(?=\s*:)/g));
  const used = new Map<string, string>();
  for (const file of themedFiles()) {
    for (const match of readFileSync(file, 'utf8').matchAll(/var\((--color-[\w-]+)/g)) {
      used.set(match[1], file);
    }
  }
  const undefinedTokens = [...used].filter(([token]) => !defined.has(token));
  expect(undefinedTokens).toEqual([]);
});

const SURFACES = [
  '--color-surface',
  '--color-surface-page',
  '--color-surface-sunken',
  '--color-surface-hover',
  '--color-accent-soft',
];

for (const [name, values] of [
  ['light', light],
  ['dark', dark],
] as const) {
  const ratio = (text: string, surface: string) =>
    contrastRatio(parseColor(values.get(text)!)!, parseColor(values.get(surface)!)!);

  test(`muted text keeps 4.5:1 on every surface in the ${name} theme`, () => {
    for (const surface of SURFACES) {
      expect(ratio('--color-text-muted', surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test(`text, accent text and danger text are readable in the ${name} theme`, () => {
    for (const surface of SURFACES) {
      expect(ratio('--color-text', surface)).toBeGreaterThanOrEqual(7);
      expect(ratio('--color-accent-text', surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio('--color-danger-text', '--color-danger-soft')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('--color-warning-text', '--color-warning-soft')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('--color-info-text', '--color-info-soft')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('--color-on-accent', '--color-accent')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('--color-text-inverse', '--color-surface-inverse')).toBeGreaterThanOrEqual(4.5);
  });
}

test('the dark theme draws strong borders and icons at 3:1 on its surfaces', () => {
  for (const surface of ['--color-surface', '--color-surface-page', '--color-surface-hover']) {
    for (const token of ['--color-border-strong', '--color-edge-idle', '--color-neutral']) {
      const line = contrastRatio(parseColor(dark.get(token)!)!, parseColor(dark.get(surface)!)!);
      expect(line, `${token} on ${surface}`).toBeGreaterThanOrEqual(3);
    }
  }
});
