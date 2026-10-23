// The theme check finds colour literals outside the theme files, and the codemod moves them in.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { themeViolations, violationsIn } from '../scripts/check-theme';
import { mapLiteral, readTokens, rewriteText } from '../scripts/theme-codemod';

const fixture = (name: string) => readFileSync(`tests/fixtures/theme/${name}`, 'utf8');
const tokens = readTokens(readFileSync('src/theme.css', 'utf8'));

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
  expect(violationsIn('src/theme.css', 'a{color:#fff}')).toEqual([]);
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
  const { authStylesheet } = await import('../server/routes/auth-stylesheet');
  const css = authStylesheet();
  expect(css).toContain('--color-surface:');
  expect(css).toContain('background:var(--color-surface-page)');
  expect(violationsIn('src/auth.css', css.slice(css.indexOf('body{')))).toEqual([]);
});
