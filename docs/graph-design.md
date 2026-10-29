# Graph rendering and layout

Graph views show the structure declared in definitions. They do not infer OWL facts, evaluate
SHACL shapes or execute metric queries. The complete graph, neighborhood, relationship matrix,
contract lineage and mapping graph are complementary views, not separate sources of business
semantics.

For controls and navigation, see [the user guide](user-guide.md#model-views-and-graph-navigation).
For current package versions, see [the technology stack](../README.md#technology-stack).

## Rendering and layout engines

| Component | Implemented responsibility |
| --- | --- |
| React Flow | HTML/SVG interaction, compound nodes, selection and handles |
| ELK Layered | Directed layout with areas, ports and orthogonal routes |
| ELK SPOrE / box packing | Network overlap cleanup and compact area placement |
| Cytoscape/fCoSE | Headless Network positioning; never the browser renderer |
| React Flow Smart Edge | Shared worker routes for detailed/visible connections |
| Local graph functions | Traversal, projection, labels and incremental placement |

Sigma/WebGL was considered for very large networks but is not an implemented mode. Adding another
renderer would need explicit behavior for editable cards, port identity, selection and provenance;
it is not a drop-in performance switch.

## Whole-model graph pipeline

`src/graph/FullGraph.tsx` renders the projection built from original entities and relationships:

1. Preserve each definition's ID and source evidence. Parallel directed relationships can share
   one link bundle, but every original relationship remains available for inspection.
2. Apply the selected display grouping. Automatic uses the first applicable mode with useful
   groups. These areas are view organization, not additional standard semantics.
3. Use Layered layout by default. Network uses fCoSE positions, then overlap cleanup and area
   packing rather than assuming that force layout cannot overlap HTML cards.
4. Render parent areas before their children using relative positions and `parentId`.
5. Retain ELK route vertices while their endpoints match live handles. Dragging invalidates stale
   routes and falls back to live geometry. SVG appearance props are selected separately so graph
   metadata is not forwarded onto DOM elements.
6. Compute obstacle-aware worker routes only at useful detail levels or for selected connections.
   Whole-model views use inexpensive native paths instead of routing thousands of tiny edges.
7. Fit the actual pane. When every entity name would be unreadable, start with counted area
   cards. Models above 250 visible business entities always start collapsed; expanding restores
   all entities and their folded relationships.

`src/graph/full-layout.ts` and its workers own engine input/output.
`src/graph/overview-capacity.ts` decides readable initial capacity.
`src/graph/edge-styles.ts` supplies line/legend styles and SVG-safe appearance;
`src/graph/RoutedEdge.tsx` keeps fallback routes attached while a worker result is pending or no
longer matches current endpoints.

Selection changes emphasis rather than deleting the rest of the model. The optional mini-map is
off until requested. A finite viewport cannot display an unlimited number of full-size labels;
area collapse, zoom and focused views make that trade-off explicit.

## Neighborhood and incremental traversal

`src/graph/NeighborhoodGraph.tsx` places the center between incoming and outgoing neighbors. Local
functions group links, assign distinct routes and place labels; full model layout engines are not
rerun for every small walk.

A walk records centers and the relationship used to reach them. Expansion sets record their
origin, nodes, edges and direction. `src/graph/incremental-layout.ts` places new nodes beside that
origin without moving existing nodes. Collapse removes only nodes contributed by that expansion;
shared contributions remain. Back, Forward and Undo reconstruct the recorded canvas.

Connected traversal runs in a worker with a 150-node initial budget and a 500-node expansion cap.
It follows requested direction and visibility switches. Frontier counts distinguish reachable
content from content already drawn. Large additions are revealed over multiple frames so input
remains responsive. `expansion-viewport.ts` chooses a readable target viewport before publishing
an expanded canvas instead of briefly mounting it at fit-all scale.

Names use identifier-boundary breaks without changing text. Relationship labels compensate for
zoom, reserve their painted bounds and stay above edge paths. Displaced labels have leader lines;
labels that cannot fit within the current canvas remain available on hover. At low zoom, showing
all labels is intentionally replaced by hover/selection detail.

## Contract lineage and mapping graphs

`src/odcs/lineage.ts` builds project-local dependency cards for tables, semantic datasets, metrics
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

`lineage-view.ts` chooses nearby cards that fit whole at the readable entry zoom. It prioritizes
tables, then datasets and metrics. If the actual layout is larger than estimated, the last
candidate is removed and the view is laid out again. Omitted cards remain reachable through a
counted Show all action or selected path. Explicit Fit can zoom out beyond the readable entry
scale; it takes precedence over a pending automatic first-view adjustment.

Graph labels and card names use zoom-dependent typography; small detail lines disappear rather
than being shown at an unreadable size. Compensated names are bounded by card height. These are
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
- [ELK SPOrE overlap cleanup](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-sporeOverlap.html)
- [Cytoscape.js](https://js.cytoscape.org/)
- [fCoSE](https://github.com/iVis-at-Bilkent/cytoscape.js-fcose)
- [React Flow Smart Edge](https://github.com/tisoap/react-flow-smart-edge)
- [Sigma rendering](https://www.sigmajs.org/concepts/rendering/) — reviewed, not implemented
