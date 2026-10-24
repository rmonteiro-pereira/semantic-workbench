# Round 10: authentication dark coverage correction

Application/capture head: `351163b7356facfd02e8a57bc4234589b784ba75`.
The independent AUTH-DA report accounts for all 28 inspected native images and identifies the
following 12 account-dialog captures as light, despite their requested dark set. All six auth
partitions were inspected (168 images). No complete main-tour review is claimed: capture was
stopped during server light after this coverage failure, before any source change.

| # | Severity | Screen and size | Defect | Resolution |
| --- | --- | --- | --- | --- |
| R10-CAP-1 | S2 | `workbench-auth-connect-prompt-390.png`, `workbench-auth-connect-prompt-1280.png`, `workbench-auth-connect-prompt-1440.png`, `workbench-auth-connect-prompt-2560.png`, `workbench-auth-connected-accounts-390.png`, `workbench-auth-connected-accounts-1280.png`, `workbench-auth-connected-accounts-1440.png`, `workbench-auth-connected-accounts-2560.png`, `workbench-auth-connected-github-390.png`, `workbench-auth-connected-github-1280.png`, `workbench-auth-connected-github-1440.png`, `workbench-auth-connected-github-2560.png` | The three account/connection dialog families remain light at every requested dark viewport. The separate remote capture helper bypasses the common theme setup. | Delegate to the shared authentication geometry/capture helper and verify the active CSS color scheme. A fresh complete round is required. |

This row records a capture-coverage defect; it does not claim a product dark-theme regression.
The source PNGs and logs remain under `/tmp/polish-round10/`. Partial server reviews do not
establish a complete clean result and are excluded from completed review counts.
