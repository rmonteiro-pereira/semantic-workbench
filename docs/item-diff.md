# Item comparison

The workbench compares structured definitions by item address. The browser requests
`GET /api/projects/:slug/item-diff?from=<side>&to=<side>` with these side names:

| Side | Definitions and address history |
| --- | --- |
| `published` | The commit currently published by the workbench. |
| `working` | Saved files in the person's working copy. Editor drafts stay outside the comparison. |
| `branch:<name>` | The commit at the tip of a visible branch. |
| `commit:<id>` | A full commit ID reachable from a visible branch. |

Both sides require project history access. Hidden sides and missing sides return the same answer.
File permissions apply on both sides. Application and agent callers use published definitions
through their regular operations.
