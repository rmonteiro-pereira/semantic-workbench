# Contract: route inventory

Every row of `ROUTE_ACTIONS` in `src/server/auth/route-actions.ts` maps to an exposed tool, a named
later increment, or a reason it is not an agent operation (decision M17). A test reads the route
table and `docs/mcp-contract.md` and fails when a row is missing here, when a row here no longer exists, or when
a `tool:` entry names a tool that is not in the tool table there. The static page fallback
row is not an operation and is excluded by that test. Rows added by this feature are listed first.

The rows live in `docs/mcp-contract.md`, which tests read.

Totals at the time of writing: 19 existing rows give a tool, 83 are later increments and 16 are not
agent operations. The test prints the counts, and the documentation quotes the printed values.
