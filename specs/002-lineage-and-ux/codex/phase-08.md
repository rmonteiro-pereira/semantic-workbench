# Codex brief: Phase 9 (US5), T066 and T067 (sidebar)

Repository: /home/rodrigo/projetos/semantic-workbench, branch `002-lineage-and-ux`. Do not commit.
Do not touch `data/`. Do not modify tests or checks to make them pass.

## Tasks

- **T066**: resizable sidebar with a separator, a width variable and persistence; two-line file
  and project names; a collapsible Examples section. Files: `src/main.tsx` (the `<aside
  id="workspace-sidebar">` block), `src/projects/Sidebar.tsx` (the project tree), `src/style.css`.
- **T067**: one sidebar toggle (panel icon) on desktop; the drawer's close button only below
  1100 px. Files: `src/main.tsx` (the `.workspace-toggle` button in the header), `src/style.css`.

## Requirements (spec FR-060–FR-062, contracts/ui-contracts.md "Header and status", "Sidebar")

1. Sidebar width: default 300 px, resizable 220–520 px. A separator element at the sidebar's right
   edge: `role="separator"`, accessible name `Resize sidebar`, `aria-orientation="vertical"`,
   `aria-valuemin=220`, `aria-valuemax=520`, `aria-valuenow=<current px>`, `tabIndex=0`. Pointer
   drag resizes (pointer capture; no text selection while dragging). Keyboard: ArrowLeft/ArrowRight
   ±16 px, Home → 220, End → 520. The width lives in one CSS variable (`--sidebar-width`) on the app
   root, and the grid/column that holds the sidebar uses it. Persist in `localStorage` key
   `workbench.sidebarWidth` (wrap reads/writes in try/catch; clamp on read). Only at ≥ 1100 px; in
   drawer mode (< 1100 px) the drawer keeps its current width and the separator is not rendered.
2. Tree names never clipped without the full text: file and project names wrap to at most two
   lines (`display:-webkit-box; -webkit-line-clamp:2; overflow-wrap:anywhere`), and the element
   carries `title` with the full name when it could be cut. The button's accessible name stays the
   full file name / project name (checks use `getByRole('button',{name:path,exact:true})` and
   `getByRole('treeitem',{name:project})`). The row actions (trash, "Actions for …" menu) stay
   aligned to the first line and never overlap the text.
3. Examples: wrap the seven `scale-example` "Load …" buttons in `<details className="examples">`
   with `<summary>` "Examples" (the group's accessible name is `Examples`). Collapsed by default
   when at least one project exists, open when there are none. The user's toggle is respected for
   the session (do not force it closed again after loading an example). Keep the buttons' names
   exactly as today (`Load UBL business model…` etc.).
4. Header toggle: at ≥ 1100 px one button with the panel icon (lucide `PanelLeftClose` /
   `PanelLeftOpen`), name `Hide sidebar` when the sidebar is shown and `Show sidebar` when hidden,
   `aria-expanded`, `aria-controls="workspace-sidebar"`. Hiding collapses the sidebar column (the
   main area takes the width); persisted in `localStorage` key `workbench.sidebarHidden`.
   Below 1100 px keep today's behaviour and names (`Open workspace` / `Close workspace` button that
   opens the drawer, the scrim, focus handling). The sidebar's `Close workspace drawer` button is
   rendered (or displayed) only below 1100 px.
5. Design principles from the owner: "use more modals and don't cram the UI"; nothing overlapping,
   clipped or cramped; consistent spacing, type sizes, button styles and icons with the rest of the
   app; the separator shows a subtle hover/focus affordance (2–3 px line, `col-resize` cursor) and a
   visible focus ring.

## Reuse

The existing `compact`, `sidebarOpen`, `closeWorkspace`, `workspaceToggle` logic in `src/main.tsx`;
`lucide-react` icons; existing CSS variables and colours in `src/style.css`.

## Checks that must pass (dev server at http://127.0.0.1:5173, run by the reviewer if your sandbox
cannot open ports)

- `bun --bun run check`, `bun test`
- `bun run test:responsive` (the sidebar checks added for T065: resize by pointer and keyboard,
  220–520 and persisted; no clipped names; Examples collapsed when projects exist; one sidebar
  toggle on desktop) and `bun run test:ui`, `bun run test:projects`.

Report briefly what you changed and anything you could not do.
