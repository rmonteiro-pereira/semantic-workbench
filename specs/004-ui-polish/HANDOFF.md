# UI polish release completion (v0.5.0)

The release work is complete on branch `004-ui-polish`. See [FINAL.md](FINAL.md) for the
verified head, exact gate results and remaining minor polish. No merge, tag, deployment or
container image push was performed. Only this branch was pushed.

All R1–R17 requirements, R2a and the issue-10 stepper are verified. F72–F76 are closed;
R10 has a complete clean expanded-scope round and R11 has all seven browser acceptance rows.
The corrected readable text floor is 12 px, including graph names down to zoom 0.27.

The round-2 LA–LD baseline contains 96 rows: 59 serious rows fixed and six justified serious
triages. The closure ledger records 117 observed serious rows resolved across repeated and
focused reviews. Round 16 captures local/server, light/dark, four sizes plus authentication and
clone waiting:
1,040 originals individually reviewed, 0 S1 / 0 S2 / 18 repeated S3 rows. Supplemental R11
proof adds 61 reviewed images. Final images and hash manifests are in `screenshots/after/`.
F118, F119, F124, F128, F129 and F130 remain deferred S3; their exact reasons are in FINAL.md.

The final gate includes unit, static, build, mutation, every current browser suite, container,
complete CI validation and ten consecutive lineage runs. Direct Vite checks use port 5175 and
`SW_BASE_URL=http://127.0.0.1:5175`. The owner's port 5173 and real data root were untouched.
Container and CI tests use temporary roots and their documented isolated servers. No assertion,
timeout or timing budget was loosened. Investigation and rerun history is in verification.md.
