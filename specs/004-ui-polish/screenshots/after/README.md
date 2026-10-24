# Final visual audit screenshots

Round 16 captures all 54 tour states at 390×844, 1280×720, 1440×900 and 2560×1440,
in local and server mode, in light and dark: **864 images**.

Capture head: `fb098531c69398cd0b68ae44e1b2d309df5fc1ea`. Each original PNG was independently reviewed at native size.
The twelve main-tour `audit/round-16-*.md` partitions record the complete review and severity counts.

These JPEGs retain the original dimensions, with quality 95 and chroma subsampling disabled.
There is no crop or resize. `manifest.json` records both source PNG and JPEG hashes, mode,
theme and viewport for every image. Originals were captured under `/tmp/polish-round16/`.

Additional R11 proof images, if present, are listed separately from this complete tour.

The authentication supplement adds 84 light and 84 dark images in `auth/`, with a separate
source/output hash manifest: **1,032 independently reviewed images total**. All identity-page
logos decode, calculation and graph content is settled, graph bounds are centered and whole,
and shared headers remain bounded. The six `audit/round-16-AUTH-*.md` reports cover these
additional native views.

Eight clone connection-wait states extend this round to **1,040 images**. They cover both themes and all four sizes; hashes are in clone-wait/manifest.json.
