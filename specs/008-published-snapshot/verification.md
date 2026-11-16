# Published snapshot verification

## Restart recovery

`TMPDIR=/tmp/sw-008 bun test tests/publishing.test.ts tests/published-initialization.test.ts`: 19 pass, 0 fail, 107 assertions.

SC-006 recovery matrix: 9 of 9 scenarios passed (100%). Stops after intent, ref and pointer were
exercised without an outside move and with outside fast-forward and diverged moves. An outside
move leaves the settled pointer served, the external ref unchanged and the pending move visible.
