# Round 6 focused Admin wording follow-up

Applied the strict audit brief and read the external capture logs before inspection.
Each theme log contains 32 measurements with `problems=0` and no skipped captures.
Only the assigned Projects access and Access check captures were visually reviewed here:
16 images, inspected individually at native resolution using original detail.

Capture roots: `/tmp/polish-r6-admin-wording-light/` and
`/tmp/polish-r6-admin-wording-dark/`. These include the wording fixes after `5e3738a`.

**Counts: 0 S1, 0 S2, 0 S3. No S1 or S2 found in the assigned 16 images.**

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |

The visible steward guidance at 1440 and 2560 px now names “Access grants,” matching the
navigation. At 390 and 1280 px, that guidance is below the captured page fold; the visible
Projects access fields and actions retain clear spacing and readable labels in both themes.

Access check now labels the identity field “Person ID” and explains where to obtain it.
The paragraph above the actions explains the prerequisites for Check access and Who can access,
and explains the meaning of a blank Project field. This resolves the earlier first-time-user
wording concerns. On the phone, both guidance paragraphs wrap cleanly and both action buttons
fit above the viewport bottom. No text/control overlap, unexpected clipping, sideways page
scrollbar, obviously undersized text or unreadable contrast was observed. The dark captures
remain consistently dark with readable fields, labels and explanatory text.

This is a focused review of two screens in their captured states, not a complete new audit round.
Other Admin screens, content below the captured fold and interaction behavior are outside scope.

Screens with no defects:

- server-admin-projects-390.png
- server-admin-projects-1280.png
- server-admin-projects-1440.png
- server-admin-projects-2560.png
- server-admin-access-check-390.png
- server-admin-access-check-1280.png
- server-admin-access-check-1440.png
- server-admin-access-check-2560.png
- server-dark-admin-projects-390.png
- server-dark-admin-projects-1280.png
- server-dark-admin-projects-1440.png
- server-dark-admin-projects-2560.png
- server-dark-admin-access-check-390.png
- server-dark-admin-access-check-1280.png
- server-dark-admin-access-check-1440.png
- server-dark-admin-access-check-2560.png

**Screenshots reviewed: 16 of 16.**
