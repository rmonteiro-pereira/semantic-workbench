// Reduces brand.css to what a brand may change: custom properties (the theme tokens) under the
// theme selectors. Every other rule, at-rule, property and value is dropped, and the stylesheet
// is written out again from the parts that passed, so nothing unchecked reaches the browser.
import { hasForbiddenValue } from './css-values';
import { BrandFileError } from './files';

/** The cleaned stylesheet and one sentence for each part that was dropped. */
export type SanitizedCss = { css: string; dropped: string[] };

type Block = { prelude: string; body: string };

// The selectors src/theme.css uses for its light, dark and system-dark token sets.
const THEME_SELECTORS = new Set([
  ':root',
  ":root[data-theme='dark']",
  ":root[data-theme='light']",
  ":root:not([data-theme='light'])",
  ":root:not([data-theme='dark'])",
]);

const COLOR_SCHEME_QUERY = /^@media\s*\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)$/i;
const TOKEN_NAME = /^--[a-z0-9_-]+$/i;
// Colours, lengths, numbers, font names and the functions that compute them.
const TOKEN_VALUE = /^[a-z0-9\s#.,%()/+*_'"-]+$/i;

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

// Statements that end in a semicolon, such as @import, hold no rule and are always dropped.
function dropStatements(segment: string, dropped: string[]): string {
  const lastSemicolon = segment.lastIndexOf(';');
  if (lastSemicolon < 0) return segment.trim();
  const statements = segment.slice(0, lastSemicolon).split(';');
  for (const statement of statements) {
    if (statement.trim()) dropped.push(`the statement "${statement.trim()}" is not allowed.`);
  }
  return segment.slice(lastSemicolon + 1).trim();
}

function findClosingBrace(css: string, open: number): number {
  let depth = 1;
  let position = open + 1;
  while (position < css.length && depth > 0) {
    if (css[position] === '{') depth++;
    if (css[position] === '}') depth--;
    position++;
  }
  if (depth > 0) throw new BrandFileError('a rule is not closed with }.');
  return position;
}

function readBlocks(css: string, dropped: string[]): Block[] {
  const blocks: Block[] = [];
  let position = 0;
  while (position < css.length) {
    const open = css.indexOf('{', position);
    if (open < 0) {
      dropStatements(css.slice(position) + ';', dropped);
      break;
    }
    const end = findClosingBrace(css, open);
    const prelude = dropStatements(css.slice(position, open), dropped);
    blocks.push({ prelude, body: css.slice(open + 1, end - 1) });
    position = end;
  }
  return blocks;
}

function normalizeSelector(selector: string): string {
  return selector.replace(/\s+/g, ' ').replace(/"/g, "'").trim();
}

function isThemeSelectorList(prelude: string): boolean {
  const selectors = prelude.split(',').map(normalizeSelector);
  return selectors.length > 0 && selectors.every(selector => THEME_SELECTORS.has(selector));
}

// Parentheses that do not pair up, or a quote that is never closed, could swallow what follows.
function hasBalancedDelimiters(value: string): boolean {
  let depth = 0;
  for (const character of value) {
    if (character === '(') depth++;
    if (character === ')') depth--;
    if (depth < 0) return false;
  }
  const singleQuotes = value.split("'").length - 1;
  const doubleQuotes = value.split('"').length - 1;
  return depth === 0 && singleQuotes % 2 === 0 && doubleQuotes % 2 === 0;
}

function cleanDeclarations(body: string, dropped: string[]): string[] {
  const kept: string[] = [];
  for (const declaration of body.split(';')) {
    const text = declaration.trim();
    if (!text) continue;
    const colon = text.indexOf(':');
    const name = colon < 0 ? text : text.slice(0, colon).trim();
    const value = colon < 0 ? '' : text.slice(colon + 1).trim();
    const valid = TOKEN_NAME.test(name) && value && TOKEN_VALUE.test(value);
    if (valid && !hasForbiddenValue(value) && hasBalancedDelimiters(value))
      kept.push(`${name}: ${value};`);
    else dropped.push(`the declaration "${name}" is not a plain theme token.`);
  }
  return kept;
}

function cleanRule(block: Block, dropped: string[]): string {
  if (!isThemeSelectorList(block.prelude)) {
    dropped.push(`the rule "${block.prelude}" is not a theme selector.`);
    return '';
  }
  const declarations = cleanDeclarations(block.body, dropped);
  if (!declarations.length) return '';
  const selectors = block.prelude.split(',').map(normalizeSelector).join(', ');
  return `${selectors} {\n  ${declarations.join('\n  ')}\n}\n`;
}

function cleanTopLevel(block: Block, dropped: string[]): string {
  if (!block.prelude.startsWith('@')) return cleanRule(block, dropped);
  const query = COLOR_SCHEME_QUERY.exec(block.prelude.replace(/\s+/g, ' '));
  if (!query) {
    dropped.push(`the at-rule "${block.prelude}" is not allowed.`);
    return '';
  }
  const inner = readBlocks(block.body, dropped)
    .map(rule => cleanRule(rule, dropped))
    .join('');
  if (!inner) return '';
  return `@media (prefers-color-scheme: ${query[1].toLowerCase()}) {\n${inner}}\n`;
}

/** Returns the theme-token rules of the stylesheet; throws when it cannot be read as CSS. */
export function sanitizeBrandCss(css: string): SanitizedCss {
  const dropped: string[] = [];
  const text = stripComments(css);
  const rules = readBlocks(text, dropped).map(block => cleanTopLevel(block, dropped));
  return { css: rules.join(''), dropped };
}
