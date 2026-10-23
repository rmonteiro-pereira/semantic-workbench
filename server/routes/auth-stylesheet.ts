// Builds the stylesheet of the sign-in and no-access pages. They load nothing but this one file,
// so it carries the theme tokens of the workbench itself followed by the layout of the page.
import { readFileSync } from 'node:fs';

// The image ships src/ next to server/, so the same file the browser build uses is read here.
const THEME_FILE = new URL('../../src/theme.css', import.meta.url);

// A centred card on the workbench background. Every colour is a token from the theme file.
const AUTH_LAYOUT =
  'body{font:0.9375rem/1.5 system-ui,sans-serif;margin:0;color:var(--color-text);' +
  'background:var(--color-surface-page);' +
  'min-height:100vh;display:flex;align-items:center;justify-content:center}' +
  'main{box-sizing:border-box;width:min(28rem,calc(100vw - 2rem));margin:1rem;' +
  'padding:1.75rem;background:var(--color-surface);border:1px solid var(--color-border);' +
  'border-radius:12px;' +
  'box-shadow:0 10px 30px color-mix(in srgb,var(--color-shadow) 8%,transparent);' +
  'overflow-wrap:anywhere}' +
  '.brand{display:flex;align-items:center;gap:12px;color:var(--color-accent);font-weight:800;' +
  'font-size:1.375rem;margin-bottom:1.25rem}' +
  '.brand small{display:block;font-size:0.75rem;font-weight:600;letter-spacing:3px;' +
  'color:var(--color-text-muted);margin-top:2px}' +
  'h1{font-size:1.25rem;margin:0 0 0.75rem}p{margin:0 0 0.75rem}' +
  'button,a{font:inherit;display:inline-flex;align-items:center;justify-content:center;' +
  'gap:8px;padding:9px 13px;border:1px solid var(--color-border);border-radius:7px;' +
  'background:var(--color-surface);' +
  'color:inherit;text-decoration:none;cursor:pointer}' +
  'button:hover,a:hover{background:var(--color-surface-hover)}';

let cached: string | undefined;

/** Returns the stylesheet text: the theme tokens, then the page layout. */
export function authStylesheet(): string {
  cached ??= readFileSync(THEME_FILE, 'utf8') + '\n' + AUTH_LAYOUT;
  return cached;
}
