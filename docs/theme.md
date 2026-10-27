# Theme and white-labelling

Every interface color is a CSS custom property in `src/shared/theme/theme.css`. A startup-loaded brand
bundle can override product identity and permitted tokens without rebuilding the application. This
guide is the canonical reference for light/dark behavior, palette changes and deployment branding;
[the README](../README.md#theme-and-white-labelling) gives the overview.

## The tokens

Names say what a color is for. A name that ends in `-soft` is a tinted background, `-border` is a
line, `-text` is writing in that hue, and a bare hue name is a solid color for icons, lines and
fills.

| Group | Tokens | Used for |
|---|---|---|
| Surfaces | `--color-surface`, `-surface-page`, `-surface-sunken`, `-surface-hover`, `-surface-inverse` | Cards and panels, the page behind them, wells and code boxes, hover states, tooltips |
| Borders | `--color-border-subtle`, `-border`, `-border-strong`, `-neutral`, `-neutral-strong` | Dividers, outlines of cards and inputs, handles, pale icons |
| Text | `--color-text`, `-text-secondary`, `-text-muted`, `-on-accent`, `-text-inverse` | Writing; muted text keeps at least 4.5:1 on every surface |
| Accent | `--color-accent`, `-accent-hover`, `-accent-text`, `-accent-soft`, `-accent-soft-strong`, `-accent-border`, `-accent-border-strong`, `-focus` | Primary buttons, selected tabs and nodes, selected edges, focus rings |
| Status | `--color-success`, `-warning` (`-bright`, `-text`, `-emphasis`, `-soft`, `-soft-strong`, `-border`), `-danger` (`-text`, `-strong`, `-soft`, `-border`), `-info` (`-text`, `-soft`, `-border`), `-violet`, `-orange`, `-rose`, `-metric` | Validation severities, badges, commit states, metric colors |
| Shadows | `--color-shadow`, `-mask-opaque` | Shadows and dimmed backdrops are `--color-shadow` at a percentage; the mask color only chooses what shows of an image |
| Graph | `--color-edge-idle`, `-edge-active`, `-edge-feeds`, `-edge-foreign-key`, `-edge-object`, `-edge-referent`, `-edge-link`, `-edge-measures`, `-edge-of`, `-edge-out`, `-edge-in`, `-edge-lateral` | Edge strokes and arrowheads, the edge legend. Most point at a status token, so changing the accent moves them |
| Editor | `--color-syntax-*`, `--color-editor-*` | Code highlighting (VS Code Light+ and Dark+), selection, search matches and lint underlines |

Translucent colors are written as `color-mix(in srgb, var(--color-shadow) 8%, transparent)`, so
they follow the token in both themes.

## Light and dark

The light values live under `:root`. Both dark blocks use the same token names with dark-theme
values:

- `:root[data-theme='dark']` applies an explicit Dark choice.
- `@media (prefers-color-scheme: dark)` applies the system preference through
  `:root:not([data-theme='light'])`, unless the person explicitly chose Light.

The matching `color-scheme` setting makes native form controls and scrollbars follow the theme.

The Theme control (System, Light, Dark) in the sidebar footer lives in
`src/app/workspace/ThemeControl.tsx`. `src/app/theme/theme-preference.ts` parses, reads and stores the choice under
the local-storage key `workbench.theme`; every read and write is wrapped in `try`, so blocked storage
leaves the system setting in charge. `public/theme-init.js` is a plain script in the page head. It
sets `data-theme` from the stored choice before the first paint. The server's sign-in pages carry no
script and follow the system setting; `src/server/routes/auth-stylesheet.ts` serves them
`src/shared/theme/theme.css` followed by their layout.

React Flow draws its own minimap, controls and edge labels. `src/app/style.css` maps its `--xy-*`
variables to the tokens so those follow the theme as well.

## Colors chosen at runtime

Groups of entities take a color from a list at run time. The list is the one place besides the
theme file where literals may live: `src/app/theme/theme-palette.ts`. Every entry is a mid-tone that
reads on a light and on a dark page.

## Changing the palette

Edit the value of a token in `src/shared/theme/theme.css`. To change the accent for both themes, edit
`--color-accent` (and `--color-accent-hover`, `--color-accent-text` and the soft tints beside it) in
the light set and in both dark blocks. To try a color without saving it, set it on `<html>` in the
browser's developer tools:

```js
document.documentElement.style.setProperty('--color-accent', '#c2185b');
```

To add a token, use the same name in the light set and both dark blocks, with a value appropriate
to each theme. `tests/theme-check.test.ts` fails when the sets differ, when a token is missing from
the dark set, when a stylesheet uses an undefined token, and when a text token falls below its
contrast target (muted text 4.5:1 on every surface, strong borders and icons 3:1 in dark).

## The check

`bun run check:theme` (part of `bun run check`) prints `file:line` for every color literal in
`src/` and `index.html` outside `src/shared/theme/theme.css` and `src/app/theme/theme-palette.ts`. It looks at
hex values, `rgb()`, `rgba()`, `hsl()` and the other color functions, and named colors; it ignores
comments, `transparent`, `currentColor`, `inherit`, `var()` and generated code. The scanner is
`scripts/helpers/color-literals.ts`; the check is `scripts/check-theme.ts`.

## The codemod

`bun scripts/theme-codemod.ts` replaces literals by tokens. It reads the light values of the tokens
in `src/shared/theme/theme.css` and gives each literal the closest token of a fitting job, measured as CIE76
color distance between the colors:

- A background maps to a surface, solid, pale-line or text token; a border or outline to a border,
  solid or text token; text to a text or solid token. Pale solids (`--color-neutral*`,
  `--color-success`, `--color-warning*`) never serve as text, so they cannot fall below 4.5:1.
- Surfaces and borders merge within a distance of 9, text and solid colors within 12. A literal
  further than that from every fitting token is printed with the nearest token and left alone.
- A translucent dark color in a shadow or a background becomes `--color-shadow` at its
  percentage; other translucent colors become `color-mix()` of their token.
- Tokens named for one job (`--color-syntax-*`, `--color-editor-*`, `--color-edge-*`) take only
  their exact color.
- It rewrites nothing once no literal is left. Run it again after a merge brings new colors, add a
  token or pick one by hand for what it cannot map, then run `bun run fmt`.

`--dry-run` prints the result without writing, `--report` lists every literal with its token and
distance, and paths limit the run: `bun scripts/theme-codemod.ts --dry-run src/app/odcs`.

## Browser checks

Run `bun run test:theme` to check that:

- Changing `--color-accent` updates the primary button, selected tab and focused graph node.
- The Theme control, system preference and stored choice select the expected theme.
- `theme-init.js` blocks the first paint until the saved choice is applied.
- Tour states meet text-contrast and overlap checks in both themes at 1280×720.

`bun run test:responsive` also repeats the main tour in dark at four window sizes.

The tour lives in `scripts/helpers/theme-tour.ts`. Contrast checks in
`scripts/helpers/text-geometry.ts` include `lowContrastProblems` and
`lowDisabledContrastProblems`, with a 3:1 target for disabled buttons. The `controlThemeProblems`
check in `scripts/helpers/control-geometry.ts` verifies theme colors on input backgrounds,
textareas, selects, checkboxes and radio buttons. Their base styles live in `src/app/style.css`.

## White-labelling

The shipped bundle lives in `public/brand/`. A Bun server or container can overlay any subset of
these files from the directory named by `SW_BRAND_DIR`:

| File | Purpose | Limit |
| --- | --- | --- |
| `logo.svg` | Workspace sidebar logo | 256 KiB |
| `logo-mark.svg` | Compact/sidebar and authentication mark | 256 KiB |
| `favicon.svg` | Browser tab icon | 256 KiB |
| `brand.json` | Product identity and optional support URL | 64 KiB |
| `brand.css` | Permitted theme-token overrides | 64 KiB |

Example manifest:

```json
{
  "productName": "Data Definitions",
  "shortName": "Definitions",
  "supportUrl": "https://support.example.org"
}
```

`productName` is required, with 1–60 characters. `shortName` is also required, with 1–24 characters,
but is reserved for compact naming rather than currently replacing the workspace header.
`supportUrl` is optional and reserved for support navigation. Unknown manifest keys are dropped.
Do not promise visible UI behavior for those reserved fields.

Files are read once at server startup. Restart after changing the bundle. An unreadable configured
directory stops startup. A missing file keeps the shipped default. An oversized or invalid file
is logged by name and replaced by its default without stopping the application. Other filenames
are ignored, and symlinks escaping the bundle directory are refused.

The server exposes only the five known assets at `/brand/*`. They are public in server mode so
script-free sign-in/no-access pages can display branding; that does not make workspace assets or
API data public. Vite serves `public/brand/` directly. To test `SW_BRAND_DIR`, use the built Bun
server or a container rather than expecting Vite to load the override directory.

### SVG and CSS safety

SVG is rebuilt from permitted drawing elements. Scripts, event handlers, animation,
`foreignObject`, unsafe namespace attributes, external links, stylesheet instructions and unsafe
style values are removed. SVG responses use a restrictive content policy and `nosniff`.
An SVG used as an image does not inherit page fonts or tokens: give it its own colors, optionally
with an internal system-theme media rule.

`brand.css` accepts custom properties under the supported root/theme selectors and light/dark
system media rules. Other rules/properties, imports, URL/image functions, escapes and malformed
values are dropped and logged. The file loads after the application theme so permitted overrides
win. Keep the light and dark variants explicit:

```css
:root {
  --color-accent: #5b4fa8;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --color-accent: #b7aaff;
  }
}

:root[data-theme='dark'] {
  --color-accent: #b7aaff;
}
```

Custom palettes also need appropriate hover, text and soft-background tokens. Sanitization checks
content safety, not visual contrast: changing a token can make a valid bundle hard to read. Inspect
both themes and use the rendered theme/contrast checks against the intended built frontend.

### Running with a brand directory

Build the application first, then start a local built server:

```sh
bun run build
SW_SERVE_STATIC=1 SW_BRAND_DIR=/absolute/path/to/brand bun src/server/index.ts
```

For a container, mount the directory read-only and set the environment variable:

```sh
podman run --rm --network host --userns keep-id:uid=1000,gid=1000 \
  -e SW_BRAND_DIR=/brand \
  -v "$PWD/.data:/data" \
  -v "$PWD/brand:/brand:ro" \
  semantic-workbench:dev
```

Prepare the data directory's ownership first, as described in
[container setup](../README.md#run-it-as-a-container). Docker omits the Podman user-mapping option.
A Compose override uses the same `SW_BRAND_DIR=/brand` environment and read-only mount on the
application service. On Azure, mount a configured Azure Files storage volume at `/brand` and set
that variable; use [the target setup guide](../deploy/README.md) for the resource/secret model.

### Brand checks

`bun run check:brand`, included in `check`, rejects hard-coded product identity outside the
approved bundle and technical identities. `bun run test:brand` serves a test bundle through the
built server and checks logos, page title, favicon, authentication pages, accent propagation and
sanitization of malicious SVG content. The server Git committer is a technical identity, not a
brand label; configure it separately with `SW_COMMITTER_NAME` where needed.
