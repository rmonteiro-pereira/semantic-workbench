# UI Contracts: v0.4.0

Owner's UI rule: dialogs for secondary work; the main screen gains only what is listed here.

## Header

- Server mode: person menu (display name, role summary, **Connected accounts**, **Sign out**).
  Local mode: unchanged.
- **Admin** button (Admins only; implicit Admin in local mode) opens the Admin panel launcher.
- Controls the person cannot use are hidden; **Approve**, **Publish**, **Commit…** and
  classification editors show disabled with a tooltip naming the needed role when the person can
  see the item but not act.

## Projects tree

- Per project: role badge (V/E/S/A) in server mode; "N files you cannot open" line when
  `hiddenFiles > 0`.
- Branch picker shows "in use by <name>" for branches checked out in other copies; Source Control
  gains **Publish to <default>** (Steward/Admin) and **Pull from <default>**.

## Admin panel (one dialog per area; launcher lists the areas)

| Dialog | Content |
| --- | --- |
| Users & groups | searchable table (name, email, last sign-in, groups, role per domain/project, source chips); row actions **Deactivate**/**Reactivate**, **End sessions**, **Check access** |
| Roles | read-only permission matrix (Appendix B of spec); mappings table (provider group/app role/client role → role, scope); per-project assignments |
| Policies | list (baseline read-only, Admin rules with enable switch); **New rule** → template form or **Advanced** raw editor (CodeMirror, inline validation); **Dry run** shows changed decisions; **History** with diff and **Roll back** |
| Access check | form: principal (search or groups/roles), action, resource → decision, deciding rules, attributes; **Who can access** for a project or path |
| Projects | per project: domain, everyone-can-read, extra readers, stewards, restricted paths, protected branches, protected classification level; agent client grants |
| Audit | filters (person, action, resource, decision, time), paged table, **Export** (JSONL/CSV) |
| Settings | provider status (issuer, client id, discovery, group mode, overage, keys refreshed), session lifetimes, remote-credential policy (allowed hosts, Azure DevOps on-behalf-of, GitHub), active sessions |

Every save in a dialog shows the dry-run result when decisions change and requires confirmation;
the last-Admin guard message names the change that would remove the last Admin. In local mode the
identity-specific areas (Users & groups, Settings provider section) state that they apply in
server mode.

## Sign-in pages

- `/auth/login` redirect is immediate; errors (provider unreachable, tenant mismatch, no role,
  deactivated) render a plain page with the reason and a **Try again** link; no workspace data.
