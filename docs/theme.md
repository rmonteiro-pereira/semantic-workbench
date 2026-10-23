# Theme: colour tokens, light and dark

Every colour of the interface is a CSS custom property in `src/theme.css`. This page lists what the
tokens mean, how the dark set works, how colour literals are kept out of the rest of the code and
how to change the palette. The README has the short version and the commands.

## The tokens

Names say what a colour is for. A name that ends in `-soft` is a tinted background, `-border` is a
line, `-text` is writing in that hue, and a bare hue name is a solid colour for icons, lines and
fills.

| Group | Tokens | Used for |
|---|---|---|
| Surfaces | `--color-surface`, `-surface-page`, `-surface-sunken`, `-surface-hover`, `-surface-inverse` | Cards and panels, the page behind them, wells and code boxes, hover states, tooltips |
| Borders | `--color-border-subtle`, `-border`, `-border-strong`, `-neutral`, `-neutral-strong` | Dividers, outlines of cards and inputs, handles, pale icons |
| Text | `--color-text`, `-text-secondary`, `-text-muted`, `-on-accent`, `-text-inverse` | Writing; muted text keeps at least 4.5:1 on every surface |
| Accent | `--color-accent`, `-accent-hover`, `-accent-text`, `-accent-soft`, `-accent-soft-strong`, `-accent-border`, `-accent-border-strong`, `-focus` | Primary buttons, selected tabs and nodes, selected edges, focus rings |
| Status | `--color-success`, `-warning` (`-bright`, `-text`, `-emphasis`, `-soft`, `-soft-strong`, `-border`), `-danger` (`-text`, `-strong`, `-soft`, `-border`), `-info` (`-text`, `-soft`, `-border`), `-violet`, `-orange`, `-rose`, `-metric` | Validation severities, badges, commit states, metric colours |
| Shadows | `--color-shadow`, `-mask-opaque` | Shadows and dimmed backdrops are `--color-shadow` at a percentage; the mask colour only chooses what shows of an image |
| Graph | `--color-edge-idle`, `-edge-active`, `-edge-feeds`, `-edge-foreign-key`, `-edge-object`, `-edge-referent`, `-edge-link`, `-edge-measures`, `-edge-of`, `-edge-out`, `-edge-in`, `-edge-lateral` | Edge strokes and arrowheads, the edge legend. Most point at a status token, so changing the accent moves them |
| Editor | `--color-syntax-*`, `--color-editor-*` | Code highlighting (VS Code Light+ and Dark+), selection, search matches and lint underlines |

Translucent colours are written as `color-mix(in srgb, var(--color-shadow) 8%, transparent)`, so
they follow the token in both themes.

## Light and dark

The light set is under `:root`. The dark set repeats the same names with other values, under
`:root[data-theme='dark']` and under `@media (prefers-color-scheme: dark)` for
`:root:not([data-theme='light'])`. A system that prefers dark gets dark unless the person chose
light; a person who chose dark always gets it. `color-scheme` is set with the values, so form
controls and scrollbars follow.

The Theme control (System, Light, Dark) in the sidebar footer lives in
`src/app/ThemeControl.tsx`. `src/theme-preference.ts` parses, reads and stores the choice under the
local-storage key `workbench.theme`; every read and write is wrapped in `try`, so blocked storage
leaves the system setting in charge. `public/theme-init.js` is a plain script in the page head. It
sets `data-theme` from the stored choice before the first paint. The server's sign-in pages carry no
script and follow the system setting; `server/routes/auth-stylesheet.ts` serves them
`src/theme.css` followed by their layout.

React Flow draws its own minimap, controls and edge labels. `src/style.css` maps its `--xy-*`
variables to the tokens so those follow the theme as well.

## Colours that data chooses

Groups of entities take a colour from a list at run time. The list is the one place besides the
theme file where literals may live: `src/theme-palette.ts`. Every entry is a mid-tone that reads on
a light and on a dark page.

## Changing the palette

Edit the value of a token in `src/theme.css`. To change the accent for both themes, edit
`--color-accent` (and `--color-accent-hover`, `--color-accent-text` and the soft tints beside it) in
the light set and in both dark blocks. To try a colour without saving it, set it on `<html>` in the
browser's developer tools:

```js
document.documentElement.style.setProperty('--color-accent', '#c2185b');
```

To add a token, add it to the light set in the right group and to both dark blocks with the same
value. `tests/theme-check.test.ts` fails when the sets differ, when a token is missing from the dark
set, when a stylesheet uses a token the theme does not define, and when a text token falls below
its contrast target (muted text 4.5:1 on every surface, strong borders and icons 3:1 in dark).

## The check

`bun run check:theme` (part of `bun run check`) prints `file:line` for every colour literal in
`src/`, `server/` and `index.html` outside `src/theme.css` and `src/theme-palette.ts`. It looks at
hex values, `rgb()`, `rgba()`, `hsl()` and the other colour functions, and named colours; it ignores
comments, `transparent`, `currentColor`, `inherit`, `var()` and generated code. The scanner is
`scripts/helpers/color-literals.ts`; the check is `scripts/check-theme.ts`.

## The codemod

`bun scripts/theme-codemod.ts` replaces literals by tokens. It reads the light values of the tokens
in `src/theme.css` and gives each literal the closest token of a fitting job, measured as CIE76
colour distance between the colours:

- A background maps to a surface, solid, pale-line or text token; a border or outline to a border,
  solid or text token; text to a text or solid token. Pale solids (`--color-neutral*`,
  `--color-success`, `--color-warning*`) never serve as text, so they cannot fall below 4.5:1.
- Surfaces and borders merge within a distance of 9, text and solid colours within 12. A literal
  further than that from every fitting token is printed with the nearest token and left alone.
- A translucent dark colour in a shadow or a background becomes `--color-shadow` at its
  percentage; other translucent colours become `color-mix()` of their token.
- Tokens named for one job (`--color-syntax-*`, `--color-editor-*`, `--color-edge-*`) take only
  their exact colour.
- It rewrites nothing once no literal is left. Run it again after a merge brings new colours, add a
  token or pick one by hand for what it cannot map, then run `bun run fmt`.

`--dry-run` prints the result without writing, `--report` lists every literal with its token and
distance, and paths limit the run: `bun scripts/theme-codemod.ts --dry-run src/odcs`.

## Browser checks

`bun run test:theme` swaps `--color-accent` on the page and expects the primary button, the selected
tab and the focused graph node to change colour, drives the control, the system setting and the
stored choice, checks that `theme-init.js` is a blocking script in the head, and measures text
contrast and overlaps of every tour in both themes at 1280×720. `bun run test:responsive` repeats
the main tour in dark at the four window sizes. The helpers are `scripts/helpers/theme-tour.ts` and
`lowContrastProblems` and `lowDisabledContrastProblems` (3:1 for disabled buttons) in
`scripts/helpers/text-geometry.ts`; `controlThemeProblems` in `scripts/helpers/control-geometry.ts`
fails an input, text area or select that is not filled with a theme colour, and a checkbox or radio
that keeps the browser's accent. Base form controls follow the tokens in `src/style.css`.
