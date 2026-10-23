// Fails when a colour literal appears outside the theme files. Every colour belongs in
// src/theme.css as a token, or, when data chooses it at run time, in src/theme-palette.ts.
//
//   bun scripts/check-theme.ts            check src, server and index.html
//   bun scripts/check-theme.ts <paths>    check only the given files or folders
import { readFileSync } from 'node:fs';
import { findColorLiterals } from './helpers/color-literals';
import { isThemeFile, languageOf, themedFiles } from './helpers/theme-files';

/** One colour literal found outside the theme files. */
export type ThemeViolation = { file: string; line: number; literal: string };

/** Returns the colour literals in one file's text; empty for a file the rules do not cover. */
export function violationsIn(file: string, text: string): ThemeViolation[] {
  const language = languageOf(file);
  if (!language || isThemeFile(file)) return [];
  return findColorLiterals(text, language).map(({ line, text: literal }) => ({
    file,
    line,
    literal,
  }));
}

/** Returns every violation in the given paths, in file order. */
export function themeViolations(paths?: string[]): ThemeViolation[] {
  return themedFiles(paths).flatMap(file => violationsIn(file, readFileSync(file, 'utf8')));
}

/** Prints one `file:line` per violation and returns the process exit code. */
export function runThemeCheck(paths?: string[]): number {
  const violations = themeViolations(paths);
  if (!violations.length) {
    console.log('No colour literals outside src/theme.css and src/theme-palette.ts.');
    return 0;
  }
  for (const { file, line, literal } of violations) {
    console.error(`${file}:${line}  colour literal ${literal}; use a token from src/theme.css`);
  }
  console.error(
    `${violations.length} colour literals outside the theme. Run bun scripts/theme-codemod.ts ` +
      'to replace them with tokens.',
  );
  return 1;
}

if (import.meta.main) {
  const paths = process.argv.slice(2);
  process.exit(runThemeCheck(paths.length ? paths : undefined));
}
