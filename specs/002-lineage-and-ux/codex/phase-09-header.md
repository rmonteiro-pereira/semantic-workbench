# Codex brief: Phase 9 (US5), T072 (header layout and dialog styling)

Repository: /home/rodrigo/projetos/semantic-workbench, branch `002-lineage-and-ux`. Do not commit.
Do not touch `data/`. Do not modify tests or scripts to make them pass.

## Task

T072: the header layout (sidebar toggle, title + kind badge, `New` menu, `More actions` menu, the
`Save state` status button, the primary `Commit…` button) and the styling of every dialog and menu
across the viewport matrix (390×844, 1024×768, 1280×720, 1366×768, 1440×900, 1920×1080,
2560×1440). Mostly `src/style.css` (the v0.3.0 blocks at the end: "v0.3.0 dialogs and menus",
plus the existing `.workspace-header`, `.header-actions`, `.workbench-dialog`, `.dialog-footer`
rules); small markup changes in `src/projects/Menu.tsx`, `src/projects/ImportDialog.tsx`,
`src/projects/Suggestions.tsx`, `src/projects/Modal.tsx` only if CSS cannot do it. Keep every
role, accessible name and class the checks use (ui-contracts "Header and status", "Dialogs").

## Findings to fix (screenshots under /tmp/workbench-dialog-*-{390,1280,2560}.png)

1. Import dialog (`/tmp/workbench-dialog-import-1280.png`): each destination card puts the radio on
   its own line above the text; the radio must sit left of the title/description, vertically
   aligned with the title, the whole card clickable, selected card visibly highlighted.
2. Dialog footers: secondary buttons (`Cancel`, `Close`) render at ~11 px and look disabled next to
   the primary button; make footer buttons one consistent size (13 px text, 34–36 px high), the
   secondary style clearly enabled, primary on the right, gap 8 px; at 390 px the footer buttons
   may stretch to share the width but never wrap mid-label.
3. Grouping suggestions (`-390.png`): the dialog is fine but the per-suggestion buttons are small;
   use the same button size as the footer; long file names wrap without overflow.
4. View definition (`-1280.png`): the JSON block is good; keep it scrollable inside the dialog and
   its height within the window at 1024×768 and 390×844.
5. Header: at 1024 and 1280 px the title truncates early because the actions take room; keep the
   order toggle · title/badge · (spacer) · New · More actions · Save state · Commit…; New shows its
   label from 1024 px up and only the icon below 700 px (keep `aria-label="New"`); the Save state
   button text may truncate with an ellipsis but keeps its full text in `title`; the header stays
   ≤ 64 px high on desktop and ≤ 110 px at 390 px; nothing overlaps or is clipped.
6. Menus (`.menu-popup`): align to the button's right edge, stay inside the window at 390 px (no
   part off-screen), 13 px items, disabled items show the reason in a smaller second line.

Owner's principles: "use more modals and don't cram the UI"; nothing overlapping, clipped or
cramped; consistent spacing, type sizes, button styles and icons across the app.

## Checks that must pass (dev server at http://127.0.0.1:5173; the reviewer runs them if your
sandbox cannot open ports)

- `bun --bun run check`, `bun test`
- `bun run test:dialogs` (every dialog fits the six viewports, traps focus, Escape, focus return),
  `bun run test:responsive`, `bun run test:ui`, `bun run test:autosave`.

Report briefly what you changed.
