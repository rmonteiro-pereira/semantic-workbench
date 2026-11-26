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

The browser loads the overlay when Source Control reports unpublished work on a published project.
It refreshes after saved file, branch and publication changes. If a project has never been
published, turning on the overlay compares its saved items against an empty baseline in the
browser.

The answer contains the version used on each side, total added, changed and removed counts,
a list of item addresses and changed fields, files that could not be compared, and an omitted
item count. An explicit rename or move carries the previous address. The comparison applies
only the destination's history records absent from the source's history, in destination order.
An outside rename without a record appears as a removal and an addition. Comments, key order,
formatting and line endings produce no item changes.

The published and saved readers use the snapshot limits, including 2,000,000 bytes per
document. The response includes up to 2,000 item changes and 2,000,000 bytes. It shortens displayed
field values to 500 characters and labels shortened values. Malformed files and files without
structured addresses are listed as not compared. Ambiguous addresses are reported without matching.
Tessera additions appear as fields of their owning items.

Unpublished work is visible on branches inside the workbench. The overlay is a display aid.
File and branch permissions still apply when it is off. A repository administrator with Git
access can read repository branches. The operation is available only to the workbench browser.

The comparison reports when the checked-out branch changes or its tip moves, even while the graph controls are folded. Source Control
status includes the checked-out commit ID when the branch has a commit.

## Performance

On the development server on 2026-11-18, a comparison of 2,000 items per side with 100
changes took 739.6 ms, including Git and saved-file reads. The target is one second.
In a 500-entity browser fixture, the median time from opening the graph to its rendered cards
was 2,450.1 ms with the overlay off and 2,504.4 ms with it on, an increase of 2.2%.
The target is an increase of at most 10%. The separate graph-model timing was 4.09 ms off
and 4.87 ms on. Browser timings use the median of three visits per setting.

Run the comparison and graph measurement with `bun scripts/item-diff-measure.ts`. Set
`SW_BASE_URL` to a running frontend to include the isolated browser measurement.
