# Contract: usage read operation

Inventory id `usage.read`. Route `GET /api/projects/:slug/usage`. Action `read` on the project. Effects
`read`. Limits: no request body, response bounded. MCP exposure: none in this release (reason: agents do
not need traffic to do their work; a later increment decides). Appears in the authorization matrix and
the parity table.

## Request

Query `days` (integer, 1 to retention, default retention). Unknown parameters are refused with 400.

## Answer (200)

```json
{
  "counters": { "enabled": true, "retentionDays": 30 },
  "measures": [
    {
      "measure": "workbench-requests",
      "label": "requests through this workbench",
      "from": "2026-10-19",
      "to": "2026-11-17",
      "total": 128,
      "unavailableDays": [],
      "items": [
        {
          "address": "sw1:...",
          "total": 40,
          "byOperation": { "agent.context.read": 31, "agent.plan": 9 },
          "byOrigin": { "http": 35, "mcp": 5 }
        }
      ]
    }
  ]
}
```

- With counters off: `{ "counters": { "enabled": false }, "measures": [] }`. Every person gets the
  same answer; whether to show how to enable them is decided by the interface from the person's
  administration rights.
- `items` are sorted by address; those whose document the reader may not read are absent; `total` is the
  sum of the items shown.
- `unavailableDays` lists days whose file was damaged.
- `measures` has one entry today. A later imported measure is another entry with its own `measure` and
  `label`; entries are never summed together.
- No identity fields exist in the answer.

## Refusals

A project the caller may not read answers as a missing project (404, same body and headers). A caller
without the right to read answers 403 as the other project reads do. 400 for a bad `days`.

## Caching

`Cache-Control: no-store`. The browser asks when Traffic is switched on and then at most once per
minute while it stays on, and when the active project changes.
