# Access test workspace

A data root used by the sign-in and access tests. `projects/` holds five projects; `admin/` holds
the access configuration an Admin would keep in `data/admin/` (Entra-shaped grants by group object
id); `admin-keycloak/grants.json` is the same grants keyed by Keycloak group names. People and groups
are defined in `tests/helpers/auth-identities.ts`.

| Project | Domain | Notes |
| --- | --- | --- |
| `sales-contracts` | Sales | `finance/**` restricted to the Finance group and `bob@example.org`; mappings that refer to the shared ontology, the Sales semantic model in another project, and the HR ontology |
| `sales-metrics` | Sales | metrics in draft (Frank), proposed (Alice) and approved (Bob) |
| `hr-people` | HR | protected classification level `confidential` |
| `shared-reference` | Shared | everyone with access can read |
| `lab-notes` | none | reachable only through a project grant (Carol, by e-mail) and by Admins |

Every file contains a marker `LEAK-<project>-<path>`: a response to someone who may not read the
file must never contain it.
