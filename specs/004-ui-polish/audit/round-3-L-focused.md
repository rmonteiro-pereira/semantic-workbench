# Round 3, focused local review

Independent review of all 40 focused captures in `/tmp/polish-shared-captures/{light,dark}`.
This is a targeted regression review, not a complete release round. Each screen has four sizes
(390, 1280, 1440 and 2560) in both themes. The capture logs reported zero geometry problems.

| # | Severity | Screen and size | Defect | Remediation |
| --- | --- | --- | --- | --- |
| R3-LF-1 | S2 | `local[-dark]-metric-wizard-{1280,1440,2560}.png` | The short wizard looks like an incomplete drawer attached to the upper-right corner. | Centre the content-height wizard using the shared modal surface. |
| R3-LF-2 | S2 | `local[-dark]-metric-wizard-390.png` | The compact progress line and selector repeat the step name. Disabled Back resembles an enabled secondary action. | Retain the shared stepper; distinguish disabled controls without fading their labels. Step-name simplification remains open. |
| R3-LF-3 | S1 | `local[-dark]-odcs-dataset-relationships-390.png` | The selected tab is whole, but a neighboring label appears as “neage” beside its cue. Catalog has a similar fragment. | Keep whole labels and cues; hide clipped neighboring fragments until scrolled into view. |
| R3-LF-4 | S2 | `local[-dark]-odcs-dataset-relationships-390.png` | The “referenced by” badge wraps into two lines. | Keep direction badges on one line. |
| R3-LF-5 | S2 | `local[-dark]-catalog-{1280,1440}.png`, `local[-dark]-odcs-dataset-relationships-{1280,1440}.png` | Sidebar fades expose rounded row fragments. | Remove the fade and unused inset; reclaim short-window footer height. |
| R3-LF-6 | S2 | `local[-dark]-catalog-{390,1280,1440}.png` | Descriptions are clamped and the card's open action is not visibly named. | Add a visible View details affordance; retain full-description tooltips. |

The Team and roles dialog is centered, opaque and contained at all four sizes in both themes.
The desktop Relationships table matches its summary card's readable width. Header wrapping,
one-line catalog titles and the current wizard step's fill are improved. These findings still
require new captures after remediation. No S1/S2-free round is claimed.

Screens with no additional defects: the eight `odcs-contract-section` captures (the background
sidebar finding is tracked once above). Screens reviewed: 40. Rows: 1 S1 and 5 S2.
