# Contract: `items.diff`

`GET /api/projects/:slug/item-diff?from=<side>&to=<side>`

Browser only on this base. Authorized as a project read of both sides (route action `history`, read source
`editing`), through the operation boundary. Not exposed to application callers.

## Sides

| Name | Meaning |
|------|---------|
| `published` | the committed snapshot of the default branch; absent when none exists |
| `working` | the caller's saved working copy on their current branch |
| `branch:<name>` | the tip of a branch the caller may see |
| `commit:<id>` | a full commit id that the caller may read |

Any other name: `400`, with the list of names above. A side that is hidden, unreadable or missing: `404` with
the same body for all three.

## Rename and move provenance

Each side reads the history saved on that side. Replay records present on the destination and absent
from the source by ID, in destination order. Global history, ancestry and similarity do not decide
which items pair.

## Answer

```json
{
  "from": { "side": "published", "version": "<full commit id>" },
  "to": { "side": "working", "version": "<branch and head, or working-copy digest>" },
  "counts": { "added": 0, "removed": 0, "changed": 0 },
  "changes": [
    {
      "kind": "concept | relationship | attribute | <other address kind>",
      "state": "added | removed | changed",
      "address": "<item address in the to side, or the from side when removed>",
      "previousAddress": "<present only for a recorded rename or move>",
      "name": "<item name>",
      "ambiguous": 0,
      "fields": [{ "field": "description", "before": "<bounded>", "after": "<bounded>" }]
    }
  ],
  "notCompared": [{ "path": "<file>", "side": "from | to", "reason": "<text>" }],
  "omitted": 0
}
```

- Order: file path, then kind, then address. Unchanged items are not listed.
- `omitted` counts changes cut by the limits. `before` and `after` are cut to the value limit and say so.
- No timestamps and no names of people.
