# Verification

## Local gate

The owner runs the complete gate with containers and Chromium available. Restricted development
checks do not stand in for the full gate.

| Criterion | Command | First full duration | Result |
| --- | --- | --- | --- |
| SC-013 | `bun run ci:validate` | about 46 min (2026-10-22, shared development machine) | see below; the owner's workstation run is still to be recorded |

### First full run on the development machine (2026-10-22)

The machine was shared with other heavy jobs throughout (load average between 20 and 70 on 28
threads), so durations are upper bounds and timing budgets were at risk.

| Step | Duration | Result |
| --- | --- | --- |
| verify | 169 s | passed |
| mutation | 77 s | passed, 151 of 151 mutants killed |
| browser | about 1,460 s over 23 suites | 21 passed; `test:graph` (longest main-thread task 118–140 ms against 100 ms) and `test:editor` (31–33 ms per keystroke against 30 ms) missed their timing budgets |
| image | 123 s | passed |
| container | 928 s | passed |
| pipeline | 7 s | passed |

The two timing misses repeat only under that load. This change touches no application code (`src/`
and `server/` are unchanged), and both suites passed on the same frontend in the previous gate run.
Their budgets are unchanged. Both suites must pass in the owner's run before SC-013 is accepted.
