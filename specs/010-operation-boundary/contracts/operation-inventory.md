# Contract: the operation inventory

`policies/operation-inventory.json` is reviewed with the code that changes it. Its shape is in
[../data-model.md](../data-model.md). This file states the rules a change must satisfy and what the
test checks.

## Rules

1. Every row of `ROUTE_ACTIONS` has exactly one entry in `operations`, keyed by the row's `path`
   string. No other keys.
2. Every entry's `action`, `clientAction` and the public flag derived from `dispatch` agree with the
   row. A row with `targets: 'body'` has `targets: 'body'`.
3. `id` is unique, lowercase, dotted, and stable. Changing an id is a breaking change for 006 and
   for the audit's `tool` filter.
4. `handlerChecks` lists every check from the vocabulary that the row's handler runs. A handler that
   adds a check without updating the entry fails the parity test for that operation.
5. `limits.request` names an exported constant; the test imports it and requires a positive integer.
6. `exposure` is one of the increments of M18 and R1 or `never` with a reason. A row that
   `dispatch` refuses has a reason. Rows that 006's first release exposes have `exposure.increment`
   `local-edit`.
7. `browserCapabilities` lists capabilities that are not routes (for example SHACL validation). A
   capability is not claimed as part of "the whole workbench" without an entry.

## Checks (test names)

- every row has an entry and every entry has a row
- each entry agrees with its row on action, client action and target kind
- ids are unique and match the pattern
- vocabularies and required reasons are respected
- limit constants resolve
- every handler check in the vocabulary appears in at least one parity case
- the generated table `docs/operations.md` equals the table built from the file

## Generated view

`bun scripts/operation-inventory-table.ts` writes `docs/operations.md`: one row per operation (id,
route, action, targets, effects, limits, exposure), then the browser capabilities. The page is not
edited by hand.
