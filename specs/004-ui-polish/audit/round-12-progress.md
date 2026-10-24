# Round 12: clone progress follow-up

This focused follow-up was triggered by final gate attempt 7. It is not a complete visual round.
The original gate and a delayed-event-connection reproduction both remained at Cloning after a
local missing-folder operation had already failed. The unchanged 20-second assertion recorded
that unreachable recovery state. See verification.md for the reproduction and ordering diagnosis.

| Row | Severity | State | Disposition |
| --- | --- | --- | --- |
| R12-1 | S1 | A quick clone's terminal progress event can be missed before connection or between the response and React's state commit, leaving the dialog running and its recovery actions unreachable. | Fixed: require update readiness and apply responses/events through one pure reducer; four ordering tests, three targeted mutants and all 11 Git setup checks pass. |

The new waiting dialog is measured at 390×844, 1280×720, 1440×900 and 2560×1440 in both themes.
Independent native review of all eight images reports 0 S1, 0 S2 and 0 S3; see
`round-12-clone-wait.md`. A fresh complete round 13 was required at this milestone and subsequently
passed.

The required fresh complete round 13 subsequently passed at `58aa8c4`: 1,040 reviewed originals, 0
S1 and 0 S2. The final full gate is recorded in FINAL.md.
