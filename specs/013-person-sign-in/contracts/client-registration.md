# Contract: agent program registrations

## Document

`programs.json` in the administration repository, validated by `$defs.programsFile` of
`schemas/semantic-workbench-access-v1.json` (fields in `data-model.md`). Example:

```json
{
  "formatVersion": 1,
  "programs": [
    {
      "clientId": "reference-client",
      "name": "Protocol reference client",
      "description": "The client bundled with the protocol library, used in acceptance runs.",
      "redirectUris": ["http://127.0.0.1:8765/callback"],
      "scopes": ["read", "validate", "edit", "commit"],
      "setupNote": "Start the client with the callback port 8765."
    }
  ]
}
```

## Admin routes

| Route | Action | Meaning |
| --- | --- | --- |
| `GET /api/admin/programs` | admin | The current document and its version |
| `PUT /api/admin/programs` | admin | Saves a confirmed proposal (existing receipt and base-version rules) |
| `POST /api/admin/programs/preview` | admin | Validates and dry-runs a proposal: added, changed, removed programs and the live connections each change would end |

Preview and save use the existing proposal, receipt and one-commit-per-change flow; the dry-run
body is recognised by its `programs` field.

## Validation (shared by browser and server)

1. Unknown fields refused.
2. `clientId` unique and within its alphabet.
3. Every redirect address passes FR-011: `https`, or `http` with a loopback host (`127.0.0.1`,
   `[::1]`, `localhost`) and an explicit port, or a custom scheme from the list the schema allows;
   no fragment, wildcard, user information; at most 512 characters; unique within the program.
4. `scopes` contains only offered scopes; `administration` is refused with the reason that it is not
   available yet.
5. At most 50 programs.

## Effects of a change

Removing a program, removing one of its redirect addresses (for connections created with it) or
removing a scope it holds ends the affected connections with reason `program-removed` or
`scope-removed` when the change is confirmed. The preview counts them. Adding or renaming ends
nothing.

## Documented configurations

`docs/agent-connections.md` carries one section per supported program: the registration to enter,
the program's own configuration, and the date and version of its acceptance run. A program without
a run is listed as "not tested".
