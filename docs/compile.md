# Check, compile and convert to standard Ossie

Use **Export project → Files to export → Standard Ossie (compiled)** to review a published
project and download standard files. **Validation details** on a Tessera ontology also offers
**Check as standard Ossie** and, for an editor, **Convert to standard**.
Output is valid against the bundled Ossie 0.2.0.dev0 draft. Accepting a loss report is not approval
of the exported content.

## The four operations

| Operation | Source and result | Authority |
|---|---|---|
| Check | Published snapshot or saved working copy; findings, loss report and file treatments, never compiled bytes | Read every file of the project |
| Compile | Published snapshot only; report first, then manifest and file list after acceptance; optional bounded file part | Export the project; audited |
| Bundle | Published snapshot only; streamed ZIP containing the same files, manifest and loss report as the command line | Export the project; audited |
| Convert | One clean, committed Tessera ontology in your working copy; reviewed rewrite through ordinary save | Edit the file and pass all save guards |

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

A check's `accepted` says whether its report would be acceptable under the supplied policy; it
never releases bytes. Only working-copy sources carry `unpublished: true`; published sources name
the full commit. File-list `bytes` in a released compile is a byte count, not file content.
A `file` part requires `commit`; each part has `path`, `version`, `offset`, `nextOffset` and `text`.
Continue at `nextOffset` until it is null. A changed published commit answers 409 `snapshot-changed`.

No published snapshot answers 409 `not-published`. Invalid requests answer 400; unreadable or
missing units answer 404. A bundle needing acceptance answers 409 `acceptance-required`; compile
findings refuse a bundle with 422 `refused` before any ZIP bytes. Conversion conflicts answer 409
`version-changed`, `dirty`, `no-history`, `not-tessera` or `digest-mismatch`; compile refusal answers
422 with findings. Ordinary save guards retain their normal authorization and validation errors.

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

This build has no MCP server or compile tools. The planned `check_standard` and `compile_standard`
twins await MCP integration; no agent conversion tool is exposed. Their eventual adapters must
reuse the operation boundary, export authority, exact acceptance and commit-bound part reads.


Reviewing a revision 3 root compiles its declared parts and its frozen, published provider
interfaces. Converting that root saves the merged standard ontology at the root's path. The
source part files are retained and the dependency manifest can be cleared with an explicit
dependency update if the converted root was the last consumer.
