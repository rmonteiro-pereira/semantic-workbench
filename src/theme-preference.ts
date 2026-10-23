// The person's choice of light or dark, kept in the browser and shown as the data-theme
// attribute of the page. Without a choice the page follows the system setting.

/** What the person asked for: follow the system, or always light, or always dark. */
export type ThemePreference = 'system' | 'light' | 'dark';

/** The preferences in the order the control lists them. */
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

/** Where the choice is stored. public/theme-init.js reads the same key before the first paint. */
export const THEME_STORAGE_KEY = 'workbench.theme';

/** Turns stored text into a preference; anything unknown means follow the system. */
export function parseThemePreference(stored: string | null | undefined): ThemePreference {
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

/** Reads the stored preference; storage may be blocked, in which case the system decides. */
export function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

/** Stores the preference, ignoring storage that is blocked or full. */
export function storeThemePreference(preference: ThemePreference) {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {}
}

/** Shows the preference on the page; theme.css reads the attribute. */
export function applyThemePreference(root: HTMLElement, preference: ThemePreference) {
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
}
