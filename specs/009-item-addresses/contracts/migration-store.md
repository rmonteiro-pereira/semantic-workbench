# Contract: the address migration store

## File

`<data root>/state/address-migrations/<project slug>.json`

```json
{
  "formatVersion": 1,
  "records": [
    {
      "id": "m-<operation id>-<index>",
      "kind": "item",
      "from": "sw1:sales/models/orders.yaml#model:Orders/dataset:orders/field:amount",
      "to": "sw1:sales/models/orders.yaml#model:Orders/dataset:orders/field:total",
      "at": "2026-11-16T10:30:00Z",
      "commit": "<head commit of the branch when saved>"
    },
    { "id": "d-<operation id>-0", "kind": "deleted", "from": "sw1:sales/old.yaml", "at": "...", "commit": "..." }
  ],
  "compactedBefore": "2025-11-16T00:00:00Z"
}
```

## Kinds

| Kind | `from` and `to` | Written by |
| --- | --- | --- |
| `item` | item prefix to item prefix (covers the subtree) | save and save-batch, declared by the client, validated by the server |
| `scope` | document-root scope segment prefix to the same with the new name | save, declared by the client, validated |
| `document` | document address to document address (same or other project) | `moveFile` on the server, from its own knowledge |
| `reconciliation` | an address that no longer resolves to one that does | an explicit action by someone allowed to edit the target file |
| `deleted` | the deleted address, no `to` | the delete operations of the item editor and file delete |

## Rules

1. A record's `from` and `to` are absolute addresses without a snapshot and share the record's
   project. A document migration to another project is stored in both projects' files.
2. `id` is derived from the operation id, so a retried operation produces the same ids and the
   append is idempotent.
3. Prefix matching is by whole segments. `item` and `scope` prefixes are item-chain prefixes;
   a `document` prefix is a document address, or a project address when a whole project changes slug, and covers every item chain beneath it.
4. Application order is append order. Each record is applied once. A record whose `from` equals
   its `to` is refused when written.
5. The server accepts a declared `item` or `scope` record only when `from` and `to` are in the
   request's project and in documents that the same request writes (or, for `from`, that it
   deleted or rewrote). A record for anything else is refused with a validation error and nothing
   is written.
6. The file is written as a staged copy and renamed into place by the journal in the same
   operation as the files. A recovery either completes both or rolls back both.
7. Records older than the retention period (default 365 days) are compacted: chains are collapsed
   to one record from the oldest `from` to the newest `to`, deleted markers are kept for the same
   period, and `compactedBefore` records the cut.
8. Reads go through the project's read boundary. The store holds no person identity and is never
   sent to logs or telemetry. It is not served by any HTTP route in this feature.
9. A migrated project file set moves with the project through trash and restore, the same way the
   project's view state does.

## Limits

At most 64 declared records per request, 50,000 records per project file (compaction runs before
the limit is reached, and a write that would exceed it is refused with a message that names the
setting).
