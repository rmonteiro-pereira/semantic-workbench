// Says which files the theme check and the theme codemod look at.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { SourceLanguage } from './color-literals';

// These files are where colour literals are allowed to live.
const THEME_FILES = ['src/theme.css', 'src/theme-palette.ts'];

/** The folders that hold interface and server code, and the page shell, that must use tokens. */
export const THEMED_PATHS = ['src', 'server', 'index.html'];

/** Returns true for a file that may hold colour literals. */
export function isThemeFile(path: string): boolean {
  return THEME_FILES.includes(path.replaceAll('\\', '/'));
}

/** Returns how to read a file, or null when the theme rules do not apply to it. */
export function languageOf(path: string): SourceLanguage | null {
  const normalized = path.replaceAll('\\', '/');
  if (normalized.startsWith('src/generated/')) return null;
  if (normalized.endsWith('.css')) return 'css';
  if (normalized.endsWith('.html')) return 'html';
  if (/\.(?:ts|tsx)$/.test(normalized)) return 'script';
  return null;
}

function collectFiles(path: string, found: string[]) {
  if (statSync(path).isFile()) {
    if (languageOf(path) && !isThemeFile(path)) found.push(path);
    return;
  }
  for (const entry of readdirSync(path)) {
    if (entry !== 'node_modules') collectFiles(join(path, entry), found);
  }
}

/** Lists the files under the given paths that must use tokens instead of colour literals. */
export function themedFiles(paths: string[] = THEMED_PATHS): string[] {
  const found: string[] = [];
  for (const path of paths) collectFiles(path, found);
  return found;
}
