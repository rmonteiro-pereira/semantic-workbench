// Builds the stylesheet of the sign-in and no-access pages. They load nothing but this one file,
// so it carries the theme tokens of the workbench itself followed by the layout of the page.
import { readFileSync } from 'node:fs';

// The image ships both API and browser source under src/, so both use the same theme file.
const THEME_FILE = new URL('../../shared/theme/theme.css', import.meta.url);

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
  '.brand img{flex:none}' +
  'h1{font-size:1.25rem;margin:0 0 0.75rem}p{margin:0 0 0.75rem}' +
  'button,a{font:inherit;display:inline-flex;align-items:center;justify-content:center;' +
  'gap:8px;padding:9px 13px;border:1px solid var(--color-border);border-radius:7px;' +
  'background:var(--color-surface);' +
  'color:inherit;text-decoration:none;cursor:pointer}' +
  'button:hover,a:hover{background:var(--color-surface-hover)}' +
  // The agent connection pages: scope rows, the credential box and buttons that stack on a narrow screen.
  '.lead{font-size:1rem}.address,.command,.credential{overflow-wrap:anywhere;word-break:break-word;font-family:ui-monospace,monospace}' +
  '.scopes{border:1px solid var(--color-border);border-radius:8px;margin:0 0 0.75rem;padding:0.5rem 0.75rem}' +
  '.scopes legend{font-weight:600;padding:0 0.25rem}.scopes ul{list-style:none;margin:0;padding:0}' +
  '.scope label{display:flex;align-items:flex-start;gap:10px;padding:0.5rem 0;cursor:pointer}' +
  '.scope input{margin:0.3rem 0 0;flex:none}.scope-text{display:flex;flex-direction:column;gap:2px;min-width:0}' +
  '.scope-name{font-weight:600}.scope-allows,.program-description,.note{color:var(--color-text-muted)}' +
  '.scope-warning{color:var(--color-danger-text)}.scope-reason{color:var(--color-text-muted);font-style:italic}' +
  '.scope-unavailable label{cursor:default}.scope-unavailable .scope-name,.scope-unavailable .scope-allows{color:var(--color-text-muted)}' +
  '.credential{border:1px solid var(--color-border-strong);border-radius:8px;background:var(--color-surface-sunken);' +
  'padding:0.75rem;font-size:0.9375rem;user-select:all}' +
  '.command{background:var(--color-surface-sunken);border-radius:8px;padding:0.75rem}' +
  '.actions{display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:1rem}' +
  'button.primary{background:var(--color-accent);border-color:var(--color-accent);color:var(--color-on-accent)}' +
  'button.primary:hover{background:var(--color-accent-hover)}' +
  '@media (max-width:30rem){main{padding:1.25rem}.actions{flex-direction:column}.actions>*{width:100%;box-sizing:border-box}}';

let cached: string | undefined;

/** Returns the stylesheet text: the theme tokens, then the page layout. */
export function authStylesheet(): string {
  cached ??= readFileSync(THEME_FILE, 'utf8') + '\n' + AUTH_LAYOUT;
  return cached;
}
