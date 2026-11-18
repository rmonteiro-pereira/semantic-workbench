# Contract: HTTP operations for check, compile and convert

Four routes, each a row of the operation inventory (`policies/operation-inventory.json`) and of the
route table (`src/server/auth/route-actions.ts`). All bodies are JSON unless a zip is named. All are
available in local and server mode. A caller who may not read a file of the unit gets the answer for a
missing file (`404`, same body), never a list of what is hidden.

## `POST /api/projects/:slug/compile/check` — id `compile.check`

Action `read` on the project. Effects `read`. Request limit: the save request limit. Response bounded.

Request:

```json
{ "source": "published" | "working", "lossPolicy": { "policy": 1, "allow": ["tessera_notes"] } }
```

`lossPolicy` is optional and only changes whether the report counts as acceptable (`accepted` below).

Response `200`:

```json
{
  "result": "ok" | "loss" | "refused",
  "accepted": false,
  "source": { "kind": "published-snapshot" | "working-copy", "commit": "<full id, published only>", "unpublished": true /* working only */ },
  "base": { "version": "0.2.0.dev0", "label": "valid against the bundled Ossie 0.2.0.dev0 draft" },
  "findings": [{ "document": "…", "severity": "error", "code": "…", "path": "/…", "line": 1, "column": 1, "message": "…" }],
  "report": { "…": "the loss report of feature 011, with its digest" },
  "files": [{ "path": "…", "treatment": "compiled" | "copied" | "not-included", "sha256": "…" }]
}
```

`accepted` is a boolean indicating whether the report would be acceptable under the optional loss
policy (or is lossless); it does not release content. Published sources carry only `kind` and `commit`;
working sources carry only `kind` and `unpublished: true`.

No compiled bytes. `result` is `ok` (no loss, no error), `loss` (loss, no error) or `refused`. `working`
reads the caller's saved working copy and sets `unpublished: true`. A project without a published
snapshot answers `source: published` with `409` and `{ "error": "not-published" }`.

## `POST /api/projects/:slug/compile` — id `compile.run`

Action `export` on the project (the authority of today's zip export). Effects `read`. Audited. Reads
the published snapshot only.

Request:

```json
{ "accept": { "digest": "sha256:…" } | { "lossPolicy": { "policy": 1, "allow": [] } },
  "commit": "<full id>",
  "file": { "path": "…", "offset": 0 } }
```

`accept` and `file` are optional. `commit` is optional except when `file` is given, where it is required.

Response `200` with `result`:

- `refused`: `{ result, source, findings }`.
- `loss-needs-acceptance`: `{ result, source, report }`. No file content.
- `released`: `{ result, source, manifest, report, files: [{ path, sha256, bytes }] }`, plus, when `file`
  was given, `part: { path, version, offset, nextOffset|null, text }` of at most 32,768 bytes.

`files[].bytes` is a byte count, not content. `part.text` carries the requested UTF-8 content.

When `commit` is given and the published commit differs: `409 { "error": "snapshot-changed", "current": "<id>" }`.
No snapshot: `409 { "error": "not-published" }`. An acceptance that does not match the report:
`200` with `result: loss-needs-acceptance` and the fresh report (the mismatch is visible because the
digest differs).

## `GET /api/projects/:slug/compile/bundle?accept=<digest>&commit=<id>` — id `compile.bundle`

Action `export`. Audited. Response: `application/zip` streamed, with `Content-Disposition: attachment`,
`X-Compile-Commit`, `X-Compile-Digest`, `Cache-Control: no-store`. Acceptance required: `409 { error: "acceptance-required", source, reason, report }`; compile findings:
`422 { error: "refused", source, findings }`. Refusals are `4xx` JSON before any
byte of the zip. Browser only: not dispatched to a twin (binary); exposure `never`.

## `POST /api/projects/:slug/compile/convert` — id `compile.convert`

Action `edit` on the file. Handler check `authorizeWrite`. Effects `localWrite`.

Request:

```json
{ "path": "…", "baseHash": "<current file version>", "inputs": [{ "path": "…", "sha256": "…" }], "accept": { "digest": "sha256:…" } }
```

Steps: refuse unless the file is a Tessera ontology; refuse unless it has no uncommitted change and Git
holds its committed version; recompute the unit's input hashes and the loss digest in the caller's
working copy and refuse on any difference from the request; verify the unit still validates and compiles
with this file standard; save the compiled bytes through the ordinary save pipeline with `baseHash`.

Response `200`: `{ path, version, lossDigest }`. `409` with `{ error: "version-changed" | "dirty" | "no-history" | "not-tessera" | "digest-mismatch" }`. `422` with findings when a guard or a check refuses.
Not exposed to MCP now: increment `later`, reason "rewrites a source file; not an agent operation yet".
