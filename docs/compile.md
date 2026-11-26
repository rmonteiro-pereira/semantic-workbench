# Check, compile and convert to standard Ossie

Use **Export project → Files to export → Standard Ossie (compiled)** to review a published
project and download standard files. **Validation details** on a Tessera ontology also offers
**Check as standard Ossie** and, for an editor, **Convert to standard**.
Output is valid against the base the project's documents declare: the bundled Ossie 0.2.0.dev0
draft, or the [Ossie 0.3.0 draft](#ossie-030-draft). Accepting a loss report is not approval of the
exported content.

## The four operations

| Operation | Source and result | Authority |
|---|---|---|
| Check | Published snapshot or saved working copy; findings, loss report and file treatments, never compiled bytes | Read every file of the project |
| Compile | Published snapshot only; report first, then manifest and file list after acceptance; optional bounded file part | Export the project; audited |
| Bundle | Published snapshot only; streamed ZIP containing the same files, manifest and loss report as the command line | Export the project; audited |
| Convert | One clean, committed Tessera ontology in your working copy, or one 0.2.0.dev0 document to the 0.3.0 draft; reviewed rewrite through ordinary save | Edit the file and pass all save guards |

A working-copy check is labelled **Unpublished** and offers no download or acceptance action.
Unsaved editor text is outside the check: save it first. A project without a published snapshot can
still be checked, but cannot be compiled. Hidden or missing files refuse the complete unit with the
same not-found answer, without naming hidden paths. Compilation finishes on its pinned snapshot even
when another publication happens while it runs.

Ordinary export preserves original bytes. Compilation produces separate derived files and never
rewrites source, the working copy or the workbench data folders.

## Review and acceptance

The review groups dropped values by property and names their document and item address. The report
contains their size and hash, never their text. Review it before choosing **Accept this report**;
the browser sends precisely the displayed digest. A changed input, compiler version or compile
option changes that digest. A stale digest releases no bytes. Schema, reference, meaning and size
failures cannot be accepted. HTTP callers may alternatively supply an inline versioned loss policy;
the browser uses exact-digest acceptance.

After acceptance, choose **Download zip**. The archive contains standard Ossie files,
`manifest.json` and `loss-report.json`; unrelated files are listed as not included. Compiled YAML
and JSON may differ in comments and layout. Standard Ossie inputs retain their original bytes.

## Convert one file

Save and commit the ontology before opening **Convert to standard**. Git holds the backup.
Review the file's losses and before/after comparison, tick the confirmation, then convert.
The digest covers the entire project's input hashes, including sibling files. The server recomputes
these before saving and refuses a stale review. It also refuses a dirty file, missing history,
a non-Tessera file, a failing compile or a save guard refusal. The resulting project must still compile.

Only the selected file is saved. Nothing is committed, pushed or published. Commit the result as
any other edit; the previous committed version remains recoverable through Git. Dropped notes have
no reverse compiler. The success acknowledgement remains visible after the workspace refresh
marks the converted file modified. The browser only acknowledges completed HTTP 200 replies with
the requested path, a usable content hash and the reviewed digest; malformed or unsupported success
replies show an error.

## HTTP

Every endpoint runs through the shared operation boundary in local and server mode. Local
Host/Origin rules still apply; server mode requires an authenticated caller with the authority above.
Send JSON bodies with the normal application write headers and authentication.

| Method and path | Request | Successful answer |
|---|---|---|
| `POST /api/projects/:slug/compile/check` | `source` (`published` by default, or `working`), optional `lossPolicy` | `result`: `ok`, `loss` or `refused`; `source`, `base`, `findings`, `report`, `files`, `accepted` |
| `POST /api/projects/:slug/compile` | Optional `accept` (`digest` or `lossPolicy`), `commit`, `file` (`path`, `offset`) | `result`: `refused`, `loss-needs-acceptance` or `released`; released metadata includes `manifest`, `report`, `files` and optional `part` |
| `GET /api/projects/:slug/compile/bundle` | Optional query `accept` (digest) and `commit` | ZIP with `X-Compile-Commit`, `X-Compile-Digest` and `Cache-Control: no-store` |
| `POST /api/projects/:slug/compile/convert` | `path`, `baseHash`, `inputs` (path and SHA-256 per input), `accept.digest` | `path`, new `version` hash, accepted `lossDigest` |
| `POST /api/projects/:slug/compile/convert` to the 0.3 draft | `path`, `baseHash`, `target: "ossie-0.3.0.dev0"`, `converted` (SHA-256 of the previewed text) | `path`, new `version` hash, `converted` |

A check's `accepted` says whether its report would be acceptable under the supplied policy; it
never releases bytes. Only working-copy sources carry `unpublished: true`; published sources name
the full commit. File-list `bytes` in a released compile is a byte count, not file content.
A `file` part requires `commit`; each part has `path`, `version`, `offset`, `nextOffset` and `text`.
Continue at `nextOffset` until it is null. A changed published commit answers 409 `snapshot-changed`.

No published snapshot answers 409 `not-published`, with `code: "no-published-snapshot"` and the `reason`, as other routes answer a missing snapshot. Invalid requests answer 400; unreadable or
missing units answer 404. A bundle needing acceptance answers 409 `acceptance-required`; compile
findings refuse a bundle with 422 `refused` before any ZIP bytes. Conversion conflicts answer 409
`version-changed`, `dirty`, `no-history`, `not-tessera` or `digest-mismatch`; compile refusal answers
422 with findings. A conversion to the 0.3 draft answers 409 `version-changed`, `dirty`, `no-history`
or `digest-mismatch` (the text differs from the preview), and 422 `refused` when the document does not
declare 0.2.0.dev0, holds extension data that is not a JSON object, or a status rename would approve
a metric. Ordinary save guards retain their normal authorization and validation errors.

## Limits and command line

The complete project must fit 10,000 files, 64,000,000 total input bytes and 2,000,000 bytes per
document. Downloads also obey the existing 64,000,000-byte export ceiling before streaming.
Output parts are at most 32,768 UTF-8 bytes and end at character boundaries. Projects with parts or
imports remain refused until complete-unit and dependency support is integrated.

The command line is the operator's tool, reading Git as the operating-system user without workbench
authorization. Browser and HTTP entry points apply workbench authorization and audit. The existing
[compiler commands](../README.md#the-compiler-and-its-command-line) remain available:

```sh
bun run tessera check --repository <dir> --project-folder retail
bun run tessera check --files <dir>
bun run tessera compile --repository <dir> --project-folder retail --out <outside-dir> --accept-loss <digest>
```

## MCP availability

Where the agent endpoint is mounted (local mode, see [mcp.md](mcp.md)), two tools are the twins of
the check and compile routes: `check_standard` and `compile_standard`. They run through the same
operation boundary, so access, the export record, exact acceptance by digest and commit-bound part
reads are the browser's own. Both are read only. Neither accepts a loss unless the caller sends the
digest. Conversion is not an agent operation yet, and the zip download stays a browser route.


Reviewing a revision 3 root compiles its declared parts and its frozen, published provider
interfaces. Each part keeps its file name in the loss report. Dropped public additions keep
their provider identity in that report. Converting that root saves the merged standard ontology at the root's path. The
source part files are retained and the dependency manifest can be cleared with an explicit
dependency update if the converted root was the last consumer.

## Ossie 0.3.0 draft

Ossie 0.3.0 is not released. The workbench adopts its development version `0.3.0.dev0` as a draft
base, pinned to Apache Ossie commit `34e4d3752b8bc35cb5d6afbfa079bf89cffccb72` (2026-11-26); the
pinned files and their hashes are in [schemas/README.md](../schemas/README.md#ossie-030-draft-base),
and what changed from 0.2.0.dev0 is in [the 0.3 inventory](ossie-0.3-inventory.md). Labels say
"Ossie 0.3.0 draft". Upstream may still change the schema before the release; storing the released
schemas and a base without "draft" wait for that release.

A file that declares `version: 0.3.0.dev0` gets the 0.3 schema and rules; a 0.2.0.dev0 file keeps
the 0.2 schema, and any other version is still Not validated. Validation details names the base beside the counts of a 0.3 file ("Ossie 0.3.0 draft"). A compile has one base: a project of
0.3 documents is reported against the draft base, and a project that mixes 0.2 and 0.3 documents is
refused with each file and its version named until every document declares the same version.

To move a 0.2.0.dev0 file to the draft, save and commit it, then choose **Validation details →
Convert to Ossie 0.3.0 draft**. The preview lists every change: the declared version,
`custom_extensions` renamed `nonportable_extensions`, and each entry's JSON text turned into an
object. A workbench metric with the legacy status `draft` becomes `proposed`; nothing becomes
`approved`. Tick the confirmation and convert. The server converts the file again and saves only
when the result equals the preview, the file is unchanged since the preview and Git holds it clean.
Nothing is committed. New files are still created as 0.2.0.dev0.

### Ossie 0.3.0 draft: limits

A 0.3 dataset may hold its own metrics. They are items like any other, and they are reached here:

- the graph, the catalog and the Neighborhood view list them under their dataset;
- the item editor opens and edits them, including their workbench attributes;
- the governed planner uses them through `AGG(dataset.metric)` in a model metric.

These places list model metrics only:

- the Metrics view, which opens and approves a metric by its model and name;
- the metric wizard, which creates model metrics;
- the ODCS lineage canvas;
- the agent context, the plan request and the explanation tool;
- usage counters, which follow what the agent reads.

A dataset metric's status is set in the item editor's governance fields, or by editing the file.
Proposing or approving it, and changing an approved one, pass the same governance guard as a model
metric. `AGG(source.measure)` over a measure relation is refused by the planner. Tessera revision 3
parts are checked against the 0.2.0.dev0 part schema, so a part cannot use `annotations` yet.

Phase status: 0.3.0.dev0 adopted as a draft base at `34e4d3752b8b`; the released 0.3.0 is not
supported until upstream publishes it.
