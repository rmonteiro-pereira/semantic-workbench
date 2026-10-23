// Replaces colour literals in stylesheets and source files by the tokens of src/theme.css.
//
//   bun scripts/theme-codemod.ts            rewrite the files in place
//   bun scripts/theme-codemod.ts --dry-run  print what would change and write nothing
//   bun scripts/theme-codemod.ts --report   also list every literal with the token it maps to
//   bun scripts/theme-codemod.ts src/odcs   limit the run to files under the given paths
//
// Each literal becomes the closest token whose role fits the property it is used in: a
// background maps to a surface or solid colour, a border to a border colour, text to a text
// colour. Closeness is the CIE76 colour distance of the light values in theme.css. A colour with
// transparency becomes color-mix() of the token. A literal further than the tolerance from every
// fitting token is left in place and printed, so the next step is to add a token for it. The
// run changes nothing once no literals are left, so it can be repeated after other branches merge.
import { readFileSync, writeFileSync } from 'node:fs';
import {
  colorDistance,
  luminance,
  findColorLiterals,
  parseColor,
  type ColorLiteral,
  type Rgba,
  type SourceLanguage,
} from './helpers/color-literals';
import { languageOf, themedFiles } from './helpers/theme-files';

type TokenRole = 'surface' | 'border' | 'text' | 'solid' | 'shadow' | 'mask' | 'named';
type UseClass = 'background' | 'border' | 'text' | 'shadow' | 'mask' | 'any';

/** A theme token with a literal light value, the colours the codemod may map to. */
export type Token = { name: string; value: Rgba; role: TokenRole };

/** The result of mapping one literal. */
export type Mapping =
  | { ok: true; replacement: string; token: string; distance: number }
  | { ok: false; reason: string; nearest?: string; distance?: number };

/**
 * The largest colour distance (CIE76) between a literal and the token that replaces it. Tinted
 * backgrounds and borders merge within 9, because large areas of colour show small shifts. Text
 * and solid colours merge within 12. A token named for one job, such as a syntax colour, takes
 * only the exact colour it was named for.
 */
export const TOLERANCE: Record<TokenRole, number> = {
  surface: 9,
  border: 9,
  text: 12,
  solid: 12,
  shadow: 12,
  mask: 0,
  named: 0.5,
};

// Tokens named for one job are chosen by hand in code and match only their exact colour.
const NAMED_FOR_ONE_JOB = /^--color-(edge|syntax|editor)-/;

/** Returns the job a token name describes. */
export function roleOf(name: string): TokenRole {
  if (NAMED_FOR_ONE_JOB.test(name)) return 'named';
  if (name === '--color-shadow') return 'shadow';
  if (name === '--color-mask-opaque') return 'mask';
  if (/^--color-surface|-soft(-strong)?$/.test(name)) return 'surface';
  if (/^--color-border|-border(-strong)?$/.test(name)) return 'border';
  if (/^--color-(text|on-)|-(text|emphasis|strong)$/.test(name)) return 'text';
  return 'solid';
}

/** Reads the tokens with a literal value from the light set of a theme file. */
export function readTokens(themeCss: string): Token[] {
  const light = themeCss.slice(themeCss.indexOf(':root'), themeCss.indexOf('}'));
  const tokens: Token[] = [];
  for (const match of light.matchAll(/(--color-[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    const value = parseColor(match[2]);
    if (value) tokens.push({ name: match[1], value, role: roleOf(match[1]) });
  }
  return tokens;
}

const ROLES_FOR: Record<UseClass, TokenRole[]> = {
  background: ['surface', 'solid', 'text', 'shadow', 'named'],
  border: ['border', 'solid', 'text', 'named'],
  text: ['text', 'solid', 'named'],
  shadow: ['shadow', 'solid', 'surface', 'border', 'named'],
  mask: ['mask'],
  any: ['surface', 'border', 'text', 'solid', 'shadow', 'named'],
};

/** Returns what a CSS property or script attribute uses a colour for. */
export function useClassOf(property: string): UseClass {
  const name = property.toLowerCase();
  if (/mask/.test(name)) return 'mask';
  if (/shadow|filter/.test(name)) return 'shadow';
  if (/^(--.*|fill|stroke|accent-color|script|)$/.test(name)) return 'any';
  if (name.startsWith('background')) return 'background';
  if (/border|outline|column-rule/.test(name)) return 'border';
  if (/color|text-decoration/.test(name)) return 'text';
  return 'any';
}

function nearestToken(color: Rgba, use: UseClass, tokens: Token[]) {
  let best: { token: Token; distance: number } | null = null;
  for (const token of tokens) {
    if (!ROLES_FOR[use].includes(token.role)) continue;
    const distance = colorDistance(color, token.value);
    const closeEnough = distance <= TOLERANCE[token.role];
    const beatsBest = !best || distance < best.distance;
    if (closeEnough && beatsBest) best = { token, distance };
  }
  return best;
}

function isDark(color: Rgba): boolean {
  return luminance(color) < 0.09;
}

function transparencyOf(alpha: number): string {
  return `${Math.round(alpha * 100)}%`;
}

function referenceFor(token: string, alpha: number): string {
  const reference = `var(${token})`;
  if (alpha >= 1) return reference;
  return `color-mix(in srgb, ${reference} ${transparencyOf(alpha)}, transparent)`;
}

/** Maps one colour literal to a token reference, or explains why it cannot. */
export function mapLiteral(literal: string, property: string, tokens: Token[]): Mapping {
  const color = parseColor(literal);
  if (!color || [color.red, color.green, color.blue, color.alpha].some(Number.isNaN)) {
    return { ok: false, reason: 'not a colour the codemod can read' };
  }
  const use = useClassOf(property);
  const best = nearestToken(color, use, tokens);
  if (best) {
    const replacement = referenceFor(best.token.name, color.alpha);
    return { ok: true, replacement, token: best.token.name, distance: best.distance };
  }
  // A faint dark shadow looks the same whatever its exact hue.
  if (use === 'shadow' && color.alpha < 1 && isDark(color)) {
    const shadow = tokens.find(token => token.role === 'shadow')!;
    const replacement = referenceFor(shadow.name, color.alpha);
    return { ok: true, replacement, token: shadow.name, distance: 0 };
  }
  const suggestions = tokens.filter(token => token.role !== 'named');
  const any = suggestions.sort(
    (first, second) => colorDistance(color, first.value) - colorDistance(color, second.value),
  )[0];
  return {
    ok: false,
    reason: 'no token is close enough',
    nearest: any.name,
    distance: colorDistance(color, any.value),
  };
}

/** One literal in one file, with what became of it. */
export type Change = { file: string; literal: ColorLiteral; mapping: Mapping };

/** Rewrites one file's text; returns the new text and what happened to each literal. */
export function rewriteText(
  source: { text: string; language: SourceLanguage; file: string },
  tokens: Token[],
): { text: string; changes: Change[] } {
  const { text, language, file } = source;
  const changes = findColorLiterals(text, language).map(literal => ({
    file,
    literal,
    mapping: mapLiteral(literal.text, literal.property, tokens),
  }));
  let rewritten = text;
  for (const change of [...changes].reverse()) {
    if (!change.mapping.ok) continue;
    const { index, text: original } = change.literal;
    rewritten =
      rewritten.slice(0, index) +
      change.mapping.replacement +
      rewritten.slice(index + original.length);
  }
  return { text: rewritten, changes };
}

type Options = { dryRun: boolean; report: boolean; paths: string[] };

function readOptions(args: string[]): Options {
  const options: Options = { dryRun: false, report: false, paths: [] };
  for (let at = 0; at < args.length; at++) {
    if (args[at] === '--dry-run') options.dryRun = true;
    else if (args[at] === '--report') options.report = true;
    else options.paths.push(args[at]);
  }
  if (!options.paths.length) options.paths = ['src', 'server', 'index.html'];
  return options;
}

function printSummary(changes: Change[], options: Options) {
  const mapped = changes.filter(change => change.mapping.ok);
  const left = changes.filter(change => !change.mapping.ok);
  const farthest = Math.max(0, ...mapped.map(change => (change.mapping as any).distance));
  console.log(`${mapped.length} literals ${options.dryRun ? 'would be ' : ''}replaced`);
  console.log(`farthest replacement: ${farthest.toFixed(1)}`);
  const perToken = new Map<string, number>();
  for (const change of mapped) {
    const token = (change.mapping as any).token as string;
    perToken.set(token, (perToken.get(token) ?? 0) + 1);
  }
  for (const [token, count] of [...perToken].sort((first, second) => second[1] - first[1])) {
    console.log(`  ${String(count).padStart(4)}  ${token}`);
  }
  if (options.report) printReport(mapped);
  printUnmapped(left);
}

function printReport(mapped: Change[]) {
  const lines = new Set<string>();
  for (const { literal, mapping } of mapped) {
    if (!mapping.ok) continue;
    const distance = mapping.distance.toFixed(1).padStart(5);
    lines.add(`${distance}  ${literal.property.padEnd(18)} ${literal.text} -> ${mapping.token}`);
  }
  console.log([...lines].sort().reverse().join('\n'));
}

function printUnmapped(left: Change[]) {
  if (!left.length) {
    console.log('every literal was mapped');
    return;
  }
  console.log(`${left.length} literals could not be mapped; add or adjust a token for each:`);
  for (const { file, literal, mapping } of left) {
    if (mapping.ok) continue;
    const near = mapping.nearest
      ? ` (nearest ${mapping.nearest}, ${mapping.distance?.toFixed(1)})`
      : '';
    console.log(
      `  ${file}:${literal.line}  ${literal.property} ${literal.text}: ${mapping.reason}${near}`,
    );
  }
}

/** Runs the codemod over the given paths and prints a summary. */
export function runCodemod(args: string[]): number {
  const options = readOptions(args);
  const tokens = readTokens(readFileSync('src/theme.css', 'utf8'));
  const changes: Change[] = [];
  for (const file of themedFiles(options.paths)) {
    const language = languageOf(file)!;
    const original = readFileSync(file, 'utf8');
    const result = rewriteText({ text: original, language, file }, tokens);
    changes.push(...result.changes);
    if (!options.dryRun && result.text !== original) writeFileSync(file, result.text);
  }
  printSummary(changes, options);
  return changes.some(change => !change.mapping.ok) ? 1 : 0;
}

if (import.meta.main) process.exit(runCodemod(process.argv.slice(2)));
