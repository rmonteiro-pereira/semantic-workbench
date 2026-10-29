// Checks that form controls are drawn with the theme and not with the browser's own colours.
import type { Page } from '@playwright/test';

/**
 * Returns the visible inputs, text areas and selects, inside the `within` element, whose fill is
 * not a theme colour, and the checkboxes and radios that keep the browser's own accent colour. A
 * fill the browser picks, such as the grey of a text area in the dark theme, shows as a light
 * patch next to the controls that follow the theme.
 */
export async function controlThemeProblems(page: Page, within = 'body'): Promise<string[]> {
  return page.evaluate(root => {
    const scratch = document.createElement('canvas');
    scratch.width = 1;
    scratch.height = 1;
    const context = scratch.getContext('2d', { willReadFrequently: true })!;
    const toRgba = (css: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = '#000';
      context.fillStyle = css;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      return `${red},${green},${blue},${alpha}`;
    };
    const rootStyle = getComputedStyle(document.documentElement);
    const themeColors = new Set<string>();
    for (const sheet of document.styleSheets) {
      for (const rule of sheet.cssRules) {
        if (!(rule instanceof CSSStyleRule) || rule.selectorText !== ':root') continue;
        for (const name of rule.style) {
          if (name.startsWith('--color-')) themeColors.add(toRgba(rootStyle.getPropertyValue(name)));
        }
      }
    }
    const scope = document.querySelector(root) ?? document.body;
    const problems = new Set<string>();
    const fields = 'input:not([type=checkbox],[type=radio],[type=range],[type=file],[type=hidden]),textarea,select';
    for (const field of scope.querySelectorAll(fields)) {
      const box = field.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      const fill = toRgba(getComputedStyle(field).backgroundColor);
      if (fill.endsWith(',0') || themeColors.has(fill)) continue;
      const name = field.getAttribute('aria-label') ?? field.getAttribute('placeholder') ?? '';
      problems.add(`${field.tagName.toLowerCase()} "${name}" is filled with rgba(${fill}), not a theme colour`);
    }
    for (const choice of scope.querySelectorAll('input[type=checkbox],input[type=radio]')) {
      const box = choice.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      if (getComputedStyle(choice).accentColor === 'auto') {
        problems.add(`${(choice as HTMLInputElement).type} keeps the browser's own accent colour`);
      }
    }
    return [...problems];
  }, within);
}
