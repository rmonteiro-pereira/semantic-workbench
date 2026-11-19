# Contract: mesh operations

All are routes through the operation boundary with an inventory entry, an authorization row, a parity
case and a matrix case. None is exposed to agents in this feature (inventory exposure: later increment).

| Inventory id | Route | Action | Notes |
| --- | --- | --- | --- |
| `mesh.graph` | `GET /api/mesh` | read | projects the person may read, published imports between them; hidden ends are unnamed tiles |
| `mesh.dependencies.read` | `GET /api/projects/:slug/dependencies` | read | the project's imports, manifest state, "update available" and the interface change summary |
| `mesh.dependencies.update` | `POST /api/projects/:slug/dependencies/update` | edit | resolves again and writes the manifest to the person's working copy; version check on the manifest file |
| `mesh.dependents.read` | `GET /api/projects/:slug/dependents` | publish | the registry rows of the provider; answers as for a missing page without the action |
| `mesh.providers.list` | `GET /api/mesh/providers` | edit | exporting projects the person may read, with their exported concepts; for the import editor |

Answers are bounded (50 rows per page, cursor). The dependents answer holds, per row: project name,
domain name or null, imported concept names, resolved version (commit and tag, or "same repository"),
`updateAvailable`. It holds nothing else.
