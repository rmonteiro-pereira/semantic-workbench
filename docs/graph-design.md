# Graph rendering and layout

Graph views show the structure declared in definitions. They do not infer OWL facts, evaluate
SHACL shapes (that runs from Validation details) or execute metric queries. The complete graph, neighborhood, relationship matrix,
contract lineage and mapping graph are complementary views, not separate sources of business
semantics.

For controls and navigation, see [the user guide](user-guide.md#model-views-and-graph-navigation).
For current package versions, see [the technology stack](../README.md#technology-stack).

## Rendering and layout engines

| Component | Implemented responsibility |
| --- | --- |
| React Flow | HTML/SVG interaction, compound nodes, selection and handles |
| ELK Layered | Directed layout with areas, ports and orthogonal routes |
| Local `packTiles` | Network view: packs the area tiles in rows without overlap |
| React Flow Smart Edge | Shared worker routes for detailed/visible connections |
| Local graph functions | Traversal, projection, labels and incremental placement |

Sigma/WebGL was considered for very large networks but is not an implemented mode. Adding another
renderer would need explicit behavior for editable cards, port identity, selection and provenance;
it is not a drop-in performance switch.

## Whole-model graph pipeline

`src/app/graph/FullGraph.tsx` renders the projection built from original entities and relationships:

1. Preserve each definition's ID and source evidence. Parallel directed relationships can share
   one link bundle, but every original relationship remains available for inspection.
2. Apply the selected display grouping. Automatic uses the first applicable mode with useful
   groups. These areas are view organization, not additional standard semantics.
3. Use Network layout by default. Layered uses ELK routes. Network sizes each area as a tile for the whole names it holds, then packs the tiles in rows (`packTiles`) so none overlap. It draws links inside an area; links between areas are summarised on the tile ("links to N areas") and drawn only for the selected entity.
4. Render parent areas before their children using relative positions and `parentId`.
5. Retain ELK route vertices while their endpoints match live handles. Dragging invalidates stale
   routes and falls back to live geometry. SVG appearance props are selected separately so graph
   metadata is not forwarded onto DOM elements.
6. Compute obstacle-aware worker routes only at useful detail levels or for selected connections.
   Whole-model views use inexpensive native paths instead of routing thousands of tiny edges.
7. Fit the actual pane and show every entity by name. Models above 250 visible business
   entities start with counted area cards; expanding restores all entities and their folded
   relationships.

`src/app/graph/full-layout.ts` and its workers own engine input/output.
`src/app/graph/overview-capacity.ts` sizes cards and decides when areas start as counted cards.
`src/app/graph/edge-styles.ts` supplies line/legend styles and SVG-safe appearance;
`src/app/graph/RoutedEdge.tsx` keeps fallback routes attached while a worker result is pending or no
longer matches current endpoints.

Selection changes emphasis rather than deleting the rest of the model. The optional mini-map is
off until requested. A finite viewport cannot display an unlimited number of full-size labels;
area collapse, zoom and focused views make that trade-off explicit.

## Neighborhood and incremental traversal

`src/app/graph/NeighborhoodGraph.tsx` places the center between incoming and outgoing neighbors. Local
functions group links, assign distinct routes and place labels; full model layout engines are not
rerun for every small walk.

A walk records centers and the relationship used to reach them. Expansion sets record their
origin, nodes, edges and direction. `src/app/graph/incremental-layout.ts` places new nodes beside that
origin without moving existing nodes. Once cards are measured, `separateCards` in the same file moves
cards apart by their real heights, so a card whose description wraps never overlaps another. Collapse removes only nodes contributed by that expansion;
shared contributions remain. Back, Forward and Undo reconstruct the recorded canvas. A Show all connected
run that repeats one already on the trail focuses that step, and a run that adds no card adds none.

Connected traversal runs in a worker with a 150-node initial budget and a 500-node expansion cap.
It follows requested direction and visibility switches. Frontier counts distinguish reachable
content from content already drawn. Large additions are revealed over multiple frames so input
remains responsive. `expansion-viewport.ts` chooses a readable target viewport before publishing
an expanded canvas instead of briefly mounting it at fit-all scale.

Names use identifier-boundary breaks without changing text. Relationship labels compensate for
zoom, reserve their painted bounds and stay above edge paths. Displaced labels have leader lines;
labels that cannot fit within the current canvas remain available on hover. Labels on shows every
label at any zoom.

## Contract lineage and mapping graphs

`src/app/odcs/lineage.ts` builds project-local dependency cards for tables, semantic datasets, metrics
and external references. Names and expression references provide evidence; no external contract
is fetched and no SQL is run. Mapping graphs use the same canvas with cards and lines supplied
by the mapping resolver.

The canvas differs from an entity graph: lines connect rows within cards rather than only whole
nodes. Foreign-key dependency lines run from the referenced column toward the referencing column;
their label still reads child to parent, for example `orders.customer_id → customers.id`.
Reads, transforms, aggregations and metric dependencies continue toward their consumers.

`lineage-layout.ts` assigns incoming/outgoing row ports. ELK positions cards and routes lines in a
worker. `LineageCard.tsx` and `LineageColumnList.tsx` render those ports and rows; `edge-route.ts`
and `edge-labels.ts` handle drawn routes, rounded corners and labels.

### Visible, hidden and scrolling columns

A card never uses pagination. Its collapsed rows prioritize the selected path/search, connected
columns and keys. Small cards show all columns; larger cards fit a pane-dependent row budget and
use a shared **more columns** row for hidden endpoints.

Opening the card produces one windowed scrolling list, with filtering above thirty columns.
Connected rows outside the visible list retain clamped handles at the list edge, with markers
counting rows above/below. Filtered connected rows also retain an edge anchor. This preserves
connections while avoiding hundreds of rendered row controls.

Lineage labels are placed in available gaps, not on unrelated cards or labels. Bundles carry a
count once. The hop control follows one to five foreign keys and lists the reached paths without
changing the meaning or direction of the declared key.

### First-view readability

`lineage-view.ts` chooses the nearby cards that fit whole at the readable entry zoom and the canvas
frames them. It prioritizes tables, then datasets and metrics. If the actual layout is larger than
estimated, the farthest chosen card leaves the frame until the rest fit. Every card of the reach
is still laid out, so the others sit past the edge of the frame, a pan away, and no card waits
behind a control. Explicit Fit zooms out beyond the readable entry scale to show every card; it
takes precedence over a pending automatic first-view adjustment.

Whole-model and lineage card names use zoom-dependent typography, and whole-model detail lines
disappear rather than being shown at an unreadable size. Neighborhood cards keep their name, type,
description and metric count at every zoom. Compensated names are bounded by card height. These are
initial/readable-view guarantees, not a claim that arbitrary user zoom cannot make text small.

## Measurement and resize lifecycle

React Flow measures node bounds and handles after rendering. A fresh controlled-node object can
invalidate those measurements even when its DOM shape did not change. Publishing layouts must
therefore distinguish reusable dimensions from a changed node/port topology:

- FullGraph preserves prior measurements only for the same node ID, type, width and height.
  Grouping can change parent positions without invalidating unchanged local handle geometry.
- Lineage keys reuse by visible-row identity, hidden-row count and open/closed state. An open list
  also includes its row budget and connected-column identities. A changed port set is remeasured
  before new connections use it.
- The lineage watchdog retries cards left unmeasured; it is not a substitute for correct cache
  invalidation or a reason to accept hidden cards after ordinary resize.

The pinned React Flow 12.12.0 ESM patch in `patches/` batches observer-driven node updates and pane
size changes into animation frames. Latest entries for a node win within a batch. Cleanup cancels
pending frames, clears retained entries and disconnects pane observation even when its DOM ref
has already cleared. Initial pane measurements and window-resize events keep their original
synchronous behavior.

The patch is applied by Bun's frozen install and copied into both Docker dependency stages.
It does not replace the global ResizeObserver or suppress error events. Dependency upgrades must
retain the behavior tests for both ESM entrypoints or replace the patch with a verified upstream
fix. Parent size hooks, shared menus and strips also schedule layout-changing observer work
outside delivery and cancel pending callbacks on cleanup.

## Identity and view state

Definitions live in project folders. An entity is identified by its document ID and its path
within that document. Grouping corrections are view state outside the definition repository;
server mode scopes them to the person. Model export keeps original definitions rather than
exporting graph coordinates or screenshots.

Cross-file navigation uses explicit matching IDs, IRIs, physical names or concept mappings.
It does not infer equivalence from similar labels. Session navigation stores graph/walk state
separately from the underlying model definitions.

## Validation and regression coverage

Pure tests cover layout bounds, parent containment, overlap cleanup, preserved relationship
bundles, directed traversal and exact route endpoints. UBL provides a schema-derived model with
45 entities, 277 relationships and 183 directed bundles; synthetic scale fixtures exercise larger
navigation without claiming standards conformance.

Browser checks measure rendered endpoints, row handles, card containment, edge/label clearance,
contrast, responsive controls, worker routing, grouping transitions and source preservation.
Readiness requires a fitted/stable viewport and rendered geometry, not merely a finished worker.
Missing edges must not be skipped to make an attachment check pass.

The graph, lineage, grouping and responsive suites record raw resize-loop events in addition to
page/console errors. Every responsive page creation path registers the same collector, including
custom contexts used for sidebar dragging. Failures retain their geometry/timing thresholds and
can capture exact node/handle/viewport diagnostics. Mutation tests verify meaningful omissions
such as dropped nodes or overlap cleanup.

See [development commands](development.md#browser-suites) for the current script inventory and
[architecture](../ARCHITECTURE.md) for server/file/access boundaries.

## References

- [React Flow layout](https://reactflow.dev/learn/layouting/layouting)
- [React Flow subflows](https://reactflow.dev/learn/layouting/sub-flows)
- [React Flow performance](https://reactflow.dev/learn/advanced-use/performance)
- [ELK Layered](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)
- [React Flow Smart Edge](https://github.com/tisoap/react-flow-smart-edge)
- [Sigma rendering](https://www.sigmajs.org/concepts/rendering/) — reviewed, not implemented
