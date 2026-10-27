// Says which files the theme check and the theme codemod look at.
import type { SourceLanguage } from './color-literals';
import { walkFiles } from './walk-files';

// These files are where colour literals are allowed to live.
const THEME_FILES = ['src/shared/theme/theme.css', 'src/app/theme/theme-palette.ts'];

/** The source tree and page shell that must use theme tokens. */
export const THEMED_PATHS = ['src', 'index.html'];

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

/** Lists the files under the given paths that must use tokens instead of colour literals. */
export function themedFiles(paths: string[] = THEMED_PATHS): string[] {
  return walkFiles(paths, file => languageOf(file) !== null && !isThemeFile(file));
}
