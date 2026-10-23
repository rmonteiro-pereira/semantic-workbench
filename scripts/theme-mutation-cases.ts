// Runs the assertions for the theme mutants against a candidate module. Each category exercises
// exactly the decisions of the module its mutants change.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS_WITH_LITERALS = [
  '/* old: #abcdef; and color: red; are not literals */',
  '.a { color: #fff; background: #17323a14; border: 1px solid rgba(1, 2, 3, 0.5); }',
  '.b { fill: hsl(10 20% 30%); outline-color: white; stroke: #abcd; }',
  '.c { color: var(--color-text); background: transparent; fill: currentColor; }',
].join('\n');

function scanCase(candidate: any) {
  const found = candidate.findColorLiterals(CSS_WITH_LITERALS, 'css');
  assert.deepEqual(
    found.map((item: any) => item.text),
    ['#fff', '#17323a14', 'rgba(1, 2, 3, 0.5)', 'hsl(10 20% 30%)', 'white', '#abcd'],
  );
  assert.equal(found[0].line, 2);
  assert.equal(found[0].property, 'color');
  const script = [
    "// a comment with '#ff0000'",
    "const edge = { stroke: '#2a6c95' };",
    "const text = 'Row #123 of the table';",
    "const tint = 'rgba(36,124,102,0.2)';",
    "const fill = { fill: 'white', name: 'white' };",
  ].join('\n');
  const inScript = candidate.findColorLiterals(script, 'script');
  assert.deepEqual(
    inScript.map((item: any) => `${item.line}:${item.text}`),
    ['2:#2a6c95', '4:rgba(36,124,102,0.2)', '5:white'],
  );
}

function themeCheckCase(candidate: any) {
  const leaks = candidate.violationsIn('src/panel.css', '.a {\n  color: #fff;\n}');
  assert.deepEqual(leaks, [{ file: 'src/panel.css', line: 2, literal: '#fff' }]);
  assert.deepEqual(candidate.violationsIn('src/panel.css', '.a { color: var(--color-text); }'), []);
  assert.deepEqual(candidate.violationsIn('src/theme.css', '.a { color: #fff; }'), []);
  assert.deepEqual(candidate.violationsIn('src/theme-palette.ts', "const a = '#fff';"), []);
  assert.deepEqual(candidate.violationsIn('src/data.json', '{"color": "#fff"}'), []);
  assert.equal(candidate.runThemeCheck(['tests/fixtures/theme/leaky.css']), 1);
  assert.equal(candidate.runThemeCheck(['tests/fixtures/theme/clean.css']), 0);
}

function themeFilesCase(candidate: any) {
  assert.equal(candidate.languageOf('src/a.css'), 'css');
  assert.equal(candidate.languageOf('src/a.tsx'), 'script');
  assert.equal(candidate.languageOf('index.html'), 'html');
  assert.equal(candidate.languageOf('src/data.json'), null);
  assert.equal(candidate.languageOf('src/generated/validators.ts'), null);
  assert.equal(candidate.isThemeFile('src/theme.css'), true);
  assert.equal(candidate.isThemeFile('src/theme-palette.ts'), true);
  assert.equal(candidate.isThemeFile('src/style.css'), false);
  const files = candidate.themedFiles(['tests/fixtures/theme']);
  assert.deepEqual(files.sort(), [
    'tests/fixtures/theme/clean.css',
    'tests/fixtures/theme/leaky.css',
    'tests/fixtures/theme/leaky.tsx',
  ]);
}

function codemodCase(candidate: any) {
  const tokens = candidate.readTokens(readFileSync('src/theme.css', 'utf8'));
  const surface = candidate.mapLiteral('#fff', 'background', tokens);
  assert.equal(surface.token, '--color-surface');
  assert.equal(candidate.mapLiteral('#fff', 'color', tokens).token, '--color-on-accent');
  assert.equal(candidate.mapLiteral('#fff', 'border-color', tokens).ok, true);
  const shadow = candidate.mapLiteral('#17323a14', 'box-shadow', tokens);
  assert.equal(shadow.replacement, 'color-mix(in srgb, var(--color-shadow) 8%, transparent)');
  assert.equal(candidate.mapLiteral('#17323a', 'background', tokens).token, '--color-shadow');
  const dimmed = candidate.mapLiteral('#17323a55', 'background', tokens);
  assert.equal(dimmed.replacement, 'color-mix(in srgb, var(--color-shadow) 33%, transparent)');
  assert.equal(candidate.mapLiteral('#243936', 'background', tokens).token, '--color-text');
  assert.equal(candidate.mapLiteral('#ff00ff', 'color', tokens).ok, false);
  // A pale green that is far from every surface of the right job stays unmapped for a background.
  assert.equal(candidate.mapLiteral('#c8f0b8', 'background', tokens).ok, false);
  assert.equal(candidate.mapLiteral('#fbfdfc', 'background', tokens).token, '--color-surface');
}

/** Runs the case of one theme mutant category against the candidate module. */
export function themeMutationCase(candidate: unknown, category: string) {
  if (category === 'theme-scan') scanCase(candidate);
  if (category === 'theme-check') themeCheckCase(candidate);
  if (category === 'theme-files') themeFilesCase(candidate);
  if (category === 'theme-codemod') codemodCase(candidate);
}
