// The Theme control, and the problems a screen can have in a given theme, for the responsive
// suite and the theme browser check.
import type { Page } from '@playwright/test';
import { contrastRatio, parseColor } from './color-literals';
import type { TourGroup } from './all-tours';
import { screenProblems, type Screen } from './screen-tour';
import { openSettings } from './sidebar-menus';
import { controlThemeProblems } from './control-geometry';
import { lowContrastProblems, lowDisabledContrastProblems } from './text-geometry';

/** The three choices of the Theme control, as the buttons are labelled. */
export type ThemeChoice = 'System' | 'Light' | 'Dark';

/** Presses one button of the Theme control in the Settings panel, then closes the panel. */
export async function chooseTheme(page: Page, choice: ThemeChoice) {
  const settings = await openSettings(page);
  const control = settings.getByRole('group', { name: 'Theme', exact: true });
  await control.getByRole('button', { name: choice, exact: true }).click();
  await page.keyboard.press('Escape');
}

/** Opens the Settings panel, which holds the Theme control. */
async function showSettings(page: Page) {
  await openSettings(page);
}

/** The Settings panel with its Theme control; a phone opens it from the drawer. */
export const themeScreens: Screen[] = [{ name: 'theme-control', show: showSettings, dialog: '.settings-panel' }];

/** Returns geometry problems, unreadable text and unthemed controls of one screen in the theme now applied. */
export async function themedScreenProblems(page: Page, screen: Screen): Promise<string[]> {
  const geometry = await screenProblems(page, screen);
  const scope = screen.dialog ?? 'body';
  const contrast = await lowContrastProblems(page, scope);
  const disabled = await lowDisabledContrastProblems(page, scope);
  const controls = await controlThemeProblems(page, scope);
  return [...geometry, ...[...contrast, ...disabled, ...controls].map(problem => `${screen.name}: ${problem}`)];
}

/** Reads a token as the page resolves it, as a hex string such as `#566c65`. */
export async function tokenValue(page: Page, token: string): Promise<string> {
  const value = await page.evaluate(name => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), token);
  return value;
}

/** Returns the contrast ratio between two tokens as the page resolves them now. */
export async function tokenContrast(page: Page, text: string, surface: string): Promise<number> {
  const foreground = parseColor(await tokenValue(page, text));
  const background = parseColor(await tokenValue(page, surface));
  if (!foreground || !background) throw new Error(`${text} or ${surface} is not a plain colour`);
  return contrastRatio(foreground, background);
}

/** The window sizes the responsive suite measures the dark theme at. */
export const DARK_TOUR_SIZES: [number, number][] = [
  [390, 844],
  [1280, 720],
  [1440, 900],
  [2560, 1440],
];

/**
 * The screens to measure in dark at one window width: the Theme control and the main tour at
 * every size, and every tour at 1280 px, where the theme browser check also looks.
 */
export function darkTourScreens(groups: TourGroup[], width: number): Screen[] {
  const main = groups.find(group => group.title === 'screens')?.screens ?? [];
  const every = groups.flatMap(group => group.screens);
  return [...themeScreens, ...(width === 1280 ? every : main)];
}
