# Implementation evidence

## Conversion journey

The conversion POST succeeded. The subsequent workspace refresh changed the file's Git state to modified,
which remounted the dialog as a blocked conversion and erased its success acknowledgement. The dialog now
captures opening eligibility, just as the review already captures the opening target. Server-side guards
still recompute cleanliness, input hashes and the digest on confirmation.

The journey retains the original success assertion and additionally asserts a successful conversion HTTP
response with its body on failure. Its file-change comparison now includes the repository folder because
its hash walker starts at projects/. Matching recovery drafts in the fixture avoid the normal missing-draft
404 console errors without suppressing console errors. No production draft behavior changed.

Proof: dev-server browser journey passed: `PASS a project is reviewed, accepted and downloaded as standard Ossie in the browser`.
This includes conversion success, Done, one changed file, desktop and phone layout, and no console errors.
The inherited handoff records 23/23 targeted mutants killed; the full mutation suite remains a batch gate.
Port 5431 was free before startup; the run cleaned up its own Vite process group.

## Shared digest review

Removed the browser-only createHash shim and Vite resolver alias. The synchronous SHA-256 implementation
now lives in shared/tessera/digest.ts and is used unchanged by both runtimes. Web Crypto's asynchronous
API would force the synchronous compiler and its callers to change; a shared pure implementation preserves
that contract without a runtime dependency. The former shim's hash adapter and encoding negotiation are gone.

Proofs: digest.test.ts: 3 pass, 0 fail, 16 assertions (block boundaries, large input, UTF-8 and exact bytes).
The dev-server browser journey passed with additional comparisons of the shared digest in Chromium,
Chromium Web Crypto and Bun's native SHA-256 for nine lengths including padding boundaries.
