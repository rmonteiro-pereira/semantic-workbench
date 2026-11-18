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

## Departures from the implementation plan

- `bundleFiles` moved from scripts/tessera.ts into server/tessera/bundle-files.ts so CLI and HTTP use
  one assembly function, including manifest and report bytes. The shared compile-findings.ts replaces
  CLI-only finding formatting for the same reason.
- Published snapshots expose `fileSizes` for preflight limits; workspace exposes `layoutFor` for the
  caller's read/write location. Each was added as a contiguous block. UnitRead additionally carries
  `place` (branch, commit, projectFolder) so the HTTP manifest identifies exactly the CLI's source.
- Check responses add `accepted`; the HTTP and proposed MCP contracts now include it. It is advisory
  and never releases bytes. The HTTP contract clarifies source discriminants, byte counts and bundle errors.
- Convert requests carry the unit digest and all input hashes; the dialog filters losses to the chosen
  file while retaining the whole-unit digest. Conversion remains an inventoried `later` exposure;
  binary bundle dispatch is `browser-only` with exposure `never`.
- Extra modules: use-convert.ts owns review/confirm state, workspace-conversion.ts wires existing Git
  and save behavior, compile-request.ts owns typed input validation. browser-sha256.ts was added in the
  inherited work but has now been removed in favor of the single shared digest function.
- Fixtures reuse sales-contracts access roles and tests/helpers/tessera-repository.ts constants.
  tests/fixtures/compile holds only golden bundle data, regenerated with UPDATE_GOLDEN=1.
- The local browser preview compiles one file for the diff. The server recompiles the entire unit and
  applies the existing guarded save; the preview is not a separate authority.
- T034's documentation proof covers the new guide's local links and commands, plus inbound links from
  the four updated guides. It does not redefine correctness of unrelated commands in existing docs.
- T036's MCP portion cannot execute: this base has neither tests/mcp nor a server registry. Inventory
  and HTTP/in-process parity remain executable; tool contract/registry proof waits for integration.

Documentation proof: docs-paths.test.ts: 3 pass, 0 fail, 16 assertions. Leak scanning passed README,
ARCHITECTURE, the compile guide and user guide. The existing development guide has six scanner hits
for literal /tmp screenshot-command examples outside this change; usage examples are preserved.
No confidential-term hits occurred. Markdown files are excluded by the repository formatter configuration.

## Changelog coverage

The first new Unreleased entry maps to compile-service, unit-source, routes, browser-and-cli and
compile-parity tests plus the passing compile browser journey. The second maps to convert-service,
convert-dialog and routes tests and that journey's successful conversion/Done/one-file assertions.

## HTTP acknowledgement review

The browser client previously cast every 2xx JSON body to a success type. It now requires HTTP 200,
known result discriminants, typed source identifiers and fields consumed by the review. A conversion
must acknowledge the requested path, a SHA-256 version and exactly the accepted digest. ZIP replies
must identify the requested commit and accepted digest. Invalid replies become visible errors rather
than success states. This follows the existing save-reply validation pattern without adding a module.

Proof: api.test.ts: 4 pass, 0 fail, 12 assertions, including malformed 200 and unsupported 202 replies.

## Inventory and parity proof

Development-server proof: 45 pass, 0 fail, 45,035 assertions across operation-inventory,
route-actions, matrix and compile-parity (130.50 s). The generated operation table is unchanged:
`bun scripts/operation-inventory-table.ts && git diff --exit-code docs/operations.md` exited 0.
T036 remains unchecked because its MCP contract/registry portion is unavailable on this base;
that portion is skipped for integration, rather than running Bun with a nonexistent test directory.
