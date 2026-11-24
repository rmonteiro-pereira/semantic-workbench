# Contract: loss report, loss policy and manifest

All three are JSON, UTF-8, two-space indent, LF, one final newline, object keys sorted
alphabetically, arrays sorted as stated. None holds a time, a machine path, a user name or a
random identifier, so equal input gives equal bytes.

## Loss report (`loss-report.json`)

```json
{
  "reportVersion": 1,
  "compiler": { "name": "tessera", "version": "1.0.0" },
  "base": { "version": "0.2.0.dev0", "label": "valid against the bundled Ossie 0.2.0.dev0 draft" },
  "options": { "lossPolicy": null },
  "inputs": [{ "path": "retail/ontology.yaml", "sha256": "…", "treatment": "compiled" }],
  "outputs": [{ "path": "retail/ontology.yaml", "sha256": "…" }],
  "losses": [
    {
      "document": "retail/ontology.yaml",
      "item": "sw1:#ontology:Retail/concept:Order",
      "property": "tessera_notes",
      "pointer": "/ontology/0/tessera_notes",
      "bytes": 42,
      "sha256": "…"
    }
  ],
  "counts": { "tessera_notes": 1 },
  "digest": "sha256:…"
}
```

- `inputs` and `outputs` are sorted by `path`; `losses` by `document`, then `pointer`.
- `item` is the document-relative item address in the grammar of `docs/item-addresses.md` (for
  the document root, the address of the ontology item itself, such as `sw1:#ontology:Retail`).
- `bytes` and `sha256` describe the UTF-8 JSON encoding of the lost value. The value is not stored.
- Item status counts (decision E15) are absent in revision 1 because ontology items have no
  status. A later feature adds `statusCounts` under a new `reportVersion`.
- `digest` is `sha256:` plus the SHA-256 of the canonical report with the `digest` key removed.
- `treatment` is `compiled` (Tessera document), `copied` (standard Ossie file, bytes unchanged) or
  `not-included` (any other file; listed for completeness, no hash of contents beyond `sha256`).

## Loss policy file

```json
{ "policy": 1, "allow": ["tessera_notes"] }
```

`policy` is the file's version. `allow` lists property names whose loss is accepted. Unknown keys
and any other `policy` value are refused. The file's SHA-256 goes into the manifest.

## Acceptance rule

A compile with losses is released when at least one of these holds:

1. `--accept-loss` supplies a digest equal to the report's `digest`.
2. A loss policy is supplied and every loss's `property` is in `allow`.

Nothing makes a schema, reference, size, semantic or registry failure acceptable.

## Manifest (`manifest.json`)

```json
{
  "manifestVersion": 1,
  "compiler": { "name": "tessera", "version": "1.0.0" },
  "source": {
    "kind": "published-snapshot",
    "branch": "main",
    "commit": "<full commit id>",
    "projectFolder": "retail"
  },
  "base": { "version": "0.2.0.dev0", "label": "valid against the bundled Ossie 0.2.0.dev0 draft" },
  "tesseraRevisions": [1],
  "inputs": [],
  "outputs": [],
  "loss": { "digest": "sha256:…", "accepted": "digest" },
  "lossPolicySha256": null
}
```

- `source.kind` is always `published-snapshot` in a bundle. `check` prints the same shape with
  `kind` set to `snapshot` or `files-on-disk` and no `commit` for files on disk, and writes it
  nowhere.
- `loss.accepted` is `none` (no loss), `digest` or `policy`.
- `inputs` and `outputs` repeat the report's lists so the manifest stands alone.
- The manifest says nothing about approval of the content.

## Bundle layout

```text
<out>/
├── manifest.json
├── loss-report.json
└── <project folder files at their relative paths: compiled and copied Ossie documents only>
```

## Revision 2 note

The report moved to `reportVersion` 2 when revision 2 added governance. A version 2 report may carry
`statusCounts`, the number of lost governance entries by status, and the compiler version is 1.1.0. The
shape is in `specs/016-attributes-and-governance/contracts/revision-2-additions.md`.
