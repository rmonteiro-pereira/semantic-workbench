# Shared captures for specs 012 to 019: results and dispositions

The capture tasks of specs 012 to 019 are captured, judged and ticked, except 019 T020. The 018 Mesh fix and the fixes handed over from the other specs are in this branch. Each was checked with before and after pairs on the same state, viewport and theme. No image is stored in the repository. Each spec's `captures/manifest.md` names its images, and they live in the capture output folder (`<scratch>/sw-captures/out`, `<scratch>/sw-captures/recapture`).

## Per source task

| Task | Captured | Findings | Disposition |
| --- | --- | --- | --- |
| 012 T041 proposals | 15 images | "Loading proposals…" ended in an ellipsis | Fixed; pair confirms. Minor items stay recorded in the findings file |
| 013 T037 person sign-in | 13 images | "Loading connections…" ellipsis; tight spacing in empty states | Ellipsis belongs to the agent connections dialog work (sw-settings); minor items recorded |
| 014 T035 usage counters | 15 images | Loading ellipsis; graph labels break mid-word at 360 and are about 5 px at 768; long names cramped; neighbourhood group shown by colour only | Ellipsis fixed, pair confirms. Graph label size and the colour-only group touch the graph's locked label floor and go to the owner and feature 022 |
| 015 T037 agent panel | 8 images, plus the new connecting state | Long message cut at the composer with no cue; connecting looked the same as waiting | Fixed: edge shadow while more is scrolled away, and a Connecting block while the session starts. Pairs confirm |
| 016 T030 attributes and governance | 12 images | Reading sentence input hid long text; Owner, Steward and Classification had heavy browser borders | Fixed: the reading sentence is a textarea that sizes to its text in its half-width cell, and `.item-fields` text inputs and selects take the textarea's 1px frame. The comparison with the last release runs in the batch gate |
| 017 T035 item diff and WIP | 12 images | Minor only (repeated messages in the comparison dialog, edges under group bands) | Recorded in the findings file |
| 018 T053 and T054 imports and Mesh | 21 images | Imports heading under the sticky details title at 768; stale "No imports" above the editor; unlabelled import lines; pin label under its box; no gap above Used by; open part not marked; loading ellipses | All fixed in `src/app/mesh`; pairs confirm |
| 019 T015 compile | 14 images | "Checking the project…" ellipsis; refused card reads "Error ·" with an empty code | Go to the Ossie work. The comparison with the last release runs in the batch gate |
| 019 T020 convert | not captured | none | Waits for the 0.2 to 0.3 convert option to merge |

## Pair review

Before images come from the base build and after images from this branch, captured with the same states, viewports and themes. A reviewer read every pair. The first round found three layout changes the fixes had caused, and later commits removed them:

- the reading sentence spanned the full row and pushed Multiplicity down;
- the import list lost its bullets;
- the Mesh view gained a gap under the project heading.

The second round confirmed those. It also found a one-line sentence in a 110 px box, which came from the details panel's textarea minimum. The last round confirms the box now sizes to its text, and the error dialog grows only by its extra lines.

The concept, metric and contract-field editors are byte-identical before and after. The `.item-fields` frame rule changes only governance fields and the attribute dialog, and makes their text inputs slightly taller.

## Left for the batch gate

- The attribute dialog with a one-line sentence is 13 px taller than before. About 5 px is the textarea frame, and about 8 px is the details panel's textarea top margin, which still applies to the reading box.
- The app status bar overlaps the bottom of the tall governance crop in `deprecated-light-1280.png`. The section now reaches below the viewport, so this is a crop artefact and not a layout change.
- The `.item-fields` input height change is in the pairs for the owner to judge.
