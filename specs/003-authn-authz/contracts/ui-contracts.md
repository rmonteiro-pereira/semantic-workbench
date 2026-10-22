# UI Contracts: v0.4.0

Owner's UI rule: dialogs for secondary work; the main screen gains only what is listed here.

## Header

- Server mode: person menu (display name, verified address, role summary with built-in and
  custom role names, **Connected accounts**, **Sign out**). **Connected accounts** opens a small
  dialog: GitHub (connected for this session, not connected with **Connect GitHub**, or not
  available) and Azure DevOps (uses your sign-in, or not available).
- Source Control (server mode): a remote action answered with 428 shows a prompt with
  **Connect GitHub** or **Sign in again**; after consent the browser returns and the same action
  runs once. The credential setup guide is shown in local mode only.
  Local mode: unchanged.
- **Admin** button (Admins only; implicit Admin in local mode) opens the Admin panel launcher.
- Controls the person cannot use are hidden; **Approve**, **Publish**, **Commit…** and
  classification editors show disabled with a tooltip naming the needed role when the person can
  see the item but not act.

## Projects tree

- Per project: role badge in server mode (V/E/S/A for the highest built-in role, or the custom
  role's initials, with all role names in the tooltip); "N files you cannot open" line when
  `hiddenFiles > 0`.
- Branch picker shows "in use by <name>" for branches checked out in other copies; Source Control
  gains **Publish to <default>** (Steward/Admin) and **Pull from <default>**.

## Admin panel (one dialog per area; launcher lists the areas)

| Dialog | Content |
| --- | --- |
| Users & groups | searchable table (name, verified address, last sign-in, groups with names, roles per domain/project, source chips: group grant with the group name, e-mail grant, bootstrap); filter "no access"; row actions **Grant access** (opens the grant form prefilled with the address), **Deactivate**/**Reactivate**, **End sessions**, **Check access** |
| Roles & access | tab **Grants**: table (member: group name and object ID, or e-mail; role; scope; added by and when), **Add grant** form (member kind: Entra group → object ID field with the looked-up display name shown beside it, or "name not resolved"; e-mail → address field; role picker with built-in and custom roles; scope: whole workspace, domains or projects), change and remove. Tab **Roles**: built-in roles with their permission matrix (read-only, lock icon, **Duplicate as custom role**); custom roles list with **New role** and edit form (name, description, permissions as a checklist of actions grouped like Appendix B with an optional condition row per action: branch, path, document type, highest classification level; members = the role's grants with the same **Add grant** form, scope optional); **Delete** with a confirmation listing affected people |
| Policies | list (baseline read-only, Admin rules with enable switch); **New rule** → template form or **Advanced** raw editor (CodeMirror, inline validation); **Dry run** shows changed decisions; **History** with diff and **Roll back** |
| Access check | form: principal (search, or a hypothetical person by groups and e-mail address), action, resource → decision, deciding rules, attributes; **Who can access** for a project or path |
| Projects | domain list; per project: domain, everyone-with-access-can-read, listed Stewards (informational), restricted paths (groups or e-mail addresses), protected branches, protected classification level; agent client grants |
| Audit | filters (person, action, resource, decision, time), paged table, **Export** (JSONL/CSV) |
| Settings | provider status (issuer, client id, discovery, group mode, overage, keys refreshed), session lifetimes, remote-credential policy (allowed hosts, Azure DevOps on-behalf-of, GitHub), active sessions |

Every save in a dialog shows the dry-run result when decisions change (for roles, grants and
projects as "what changes for whom": each person or client with the actions gained or lost per
project) and requires confirmation;
the last-Admin guard message names the change that would remove the last Admin. In local mode the
identity-specific areas (Users & groups, Settings provider section) state that they apply in
server mode.

## Pages outside the workspace (server mode)

There is no sign-in screen: an unauthenticated page request goes straight to the provider. The
workbench renders only these minimal server-side pages, with the product name, no workspace data
and no scripts beyond the shared stylesheet:

- **No access** (`/auth/no-access`): "You are signed in as <display name> (<address>)", "An
  Admin must grant you access to this workbench", **Sign out** (a plain form posting to
  `/auth/logout` with the page's per-session token, so it works without scripts). Also shown to
  deactivated people.
- **Signed out** (`/auth/signed-out`): "You are signed out", **Sign in again**.
- **Sign-in error**: the reason (provider unreachable, tenant mismatch, expired or replayed
  sign-in attempt) and **Try again**.

Each page passes the geometry checks at the viewport matrix.
