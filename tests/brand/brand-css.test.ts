// Tests that brand.css is reduced to theme tokens under the theme selectors.
import { expect, test } from 'bun:test';
import { sanitizeBrandCss } from '../../src/server/brand/sanitize-css';

test('token overrides under the theme selectors are kept', () => {
  const { css, dropped } = sanitizeBrandCss(`
    :root { --color-accent: #6a2c91; --color-accent-soft: color-mix(in srgb, #6a2c91 12%, white) }
    :root[data-theme="dark"] { --color-accent: #b98ad6 }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme='light']) { --color-accent: #b98ad6 }
    }
  `);
  expect(dropped).toEqual([]);
  expect(css).toContain(':root {\n  --color-accent: #6a2c91;');
  expect(css).toContain('--color-accent-soft: color-mix(in srgb, #6a2c91 12%, white);');
  expect(css).toContain(":root[data-theme='dark'] {");
  expect(css).toContain('@media (prefers-color-scheme: dark) {');
});

test('url(), image functions and expressions are dropped from values', () => {
  const { css, dropped } = sanitizeBrandCss(`:root {
    --color-accent: #123456;
    --bad-url: url(https://evil.example/x.png);
    --bad-image: image-set("x.png" 1x);
    --bad-expression: expression(alert(1));
    --bad-escape: u\\72l(x);
    --bad-script: javascript:alert(1);
  }`);
  expect(css).toBe(':root {\n  --color-accent: #123456;\n}\n');
  expect(dropped).toHaveLength(5);
});

test('other selectors, properties and at-rules are dropped', () => {
  const { css, dropped } = sanitizeBrandCss(`
    @import url("https://evil.example/x.css");
    body { background: red }
    .brand { --color-accent: red }
    :root { color: red; --color-accent: #123456 }
    @font-face { font-family: x; src: url(x.woff) }
    @media (min-width: 10px) { :root { --color-accent: red } }
    :root, body { --color-accent: red }
  `);
  expect(css).toBe(':root {\n  --color-accent: #123456;\n}\n');
  expect(dropped.length).toBeGreaterThanOrEqual(6);
});

test('comments hide nothing and rules that stay empty are omitted', () => {
  const { css } = sanitizeBrandCss('/* :root { --a: 1 } */ :root { /* x */ } body { x: y }');
  expect(css).toBe('');
});

test('a rule that is not closed is refused', () => {
  expect(() => sanitizeBrandCss(':root { --color-accent: red')).toThrow('not closed');
});

test('escapes and every resource function are dropped', () => {
  const { css, dropped } = sanitizeBrandCss(`:root {
    --ok: #111111;
    --escape: \\75 rl(x);
    --cross: cross-fade(red, blue);
    --source: src("https://evil.example");
    --image: image("https://evil.example");
  }`);
  expect(css).toBe(':root {\n  --ok: #111111;\n}\n');
  expect(dropped).toHaveLength(4);
});

test('a value with unbalanced parentheses or quotes is dropped', () => {
  const { css, dropped } = sanitizeBrandCss(`:root {
    --ok: #111111;
    --open: calc(1px + 2px;
    --close: 1px);
    --crossed: 1px) (2px;
    --quote: "red;
    --single: 'a" b";
  }`);
  expect(css).toBe(':root {\n  --ok: #111111;\n}\n');
  expect(dropped.length).toBeGreaterThanOrEqual(3);
});
