# Graph rendering and layout decisions

The overview, relationship matrix and actual graph are complementary representations. The overview and matrix remain available; they do not replace the graph. For entity models, the Graph tab contains the model's entities and directed relationships. Contracts use the lineage canvas described below. Large models can collapse business areas and expand them again.

## References reviewed

- [React Flow layout overview](https://reactflow.dev/learn/layouting/layouting): React Flow supplies interaction/rendering, while node layout is provided by external engines. ELK supports compound layout and routing; the documentation notes limitations with Dagre subflows connected to external nodes.
- [React Flow subflows](https://reactflow.dev/learn/layouting/sub-flows): grouped nodes use `parentId`, relative positions, and parent-before-child ordering. Cross-group edges remain possible.
- [React Flow performance](https://reactflow.dev/learn/advanced-use/performance): memoized components and callbacks, avoiding broad subscriptions, collapsing large trees, and simpler styles reduce rendering cost.
- [ELK Layered](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html): directed layered layout, compound graphs, ports, crossing reduction and orthogonal routes.
- [ELK SPOrE overlap removal](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-sporeOverlap.html): a dedicated overlap-removal pass. We use this after the network layout rather than assuming a force layout guarantees non-overlapping HTML cards.
- [Cytoscape.js](https://js.cytoscape.org/): compound graphs, multiple layouts and renderer-specific performance controls.
- [fCoSE](https://github.com/iVis-at-Bilkent/cytoscape.js-fcose): compound spring embedding with constraints. It is used headlessly to compute network positions; React Flow remains the renderer/editor.
- [Sigma rendering](https://www.sigmajs.org/concepts/rendering/): WebGL rendering designed for large networks. It is a candidate for a future very-large-network visualization mode, rather than a drop-in replacement for editable React Flow nodes.
- [React Flow Smart Edge](https://github.com/tisoap/react-flow-smart-edge): v12-compatible, shared worker routing, obstacle avoidance, incremental cache, floating connections, subflow-aware routing and circuit-style edge hops. We use the package rather than maintaining a custom pathfinder.

## Implemented pipeline

1. Preserve original entity IDs and all relationship definitions.
2. Group parallel directed links by source/target while retaining every original ID and definition in the bundle.
3. Use the shared **Group by** selection for area boundaries. Auto chooses an available grouping with multiple groups. These are display groupings, not new standard semantics.
4. Offer **Network (fCoSE)** and **Layered (ELK)** layouts.
5. For network layout, remove residual overlaps with ELK SPOrE and pack area rectangles with ELK's box packer. Tests check actual rectangle intersections and containment.
6. Render compound areas and entity nodes in React Flow, with controlled node state, memoized node/edge components, viewport culling, area zoom, an optional mini-map (off until switched on in View options) and manual dragging.
7. Use inexpensive native routes at whole-model zoom, and route around nodes through a shared background worker for visible or selected connections at detail zoom. Show names on hover/selection, with an optional label toggle. Highlight connected entities without removing the remainder of the model.
8. Models above 250 visible business entities open with collapsed areas. Area counts expose the folded entities; clicking one expands that area. **Expand all** restores the full graph. Internal relationships are folded into the area count, and remain accessible after expansion; they are not deleted from the source.
9. Fit the whole model for spatial orientation, then zoom to an area or entity for reading. A finite viewport cannot show arbitrarily many full-size entity labels simultaneously.

## Column-level lineage canvas

For an ODCS contract, the Graph tab and an asset page's Lineage tab use `src/odcs/LineageCanvas.tsx`. The graph builder in `src/odcs/lineage.ts` reads project definitions into contract-object, semantic-dataset, metric and external-reference cards. It matches declared names and expression references without fetching contracts or executing SQL. Each edge retains the file and definition path that supplied it.

The entity graph connects whole entities and offers network or layered layouts inside area boundaries. Lineage connects rows within asset cards in a left-to-right layered layout. Foreign keys run from the referenced column to the referencing column. Reads, aggregations and metric dependencies continue toward their consumers. Declared transforms connect source objects to the affected property. Grouping colours tint contract cards without adding area containers.

`src/odcs/lineage-layout.ts` gives each visible column a fixed incoming port on the left and an outgoing port on the right. Card headers also have ports for references without a column. ELK computes card positions in a worker; React Flow draws the cards and curves between their ports. Column rows show types and property badges.

Long column lists page in groups of ten. Columns on the selected path stay pinned above the current page when needed. Edges to hidden columns attach to a counted more-columns row, so paging does not discard dependencies. Dense connections can bundle into counted lines until a selected path needs their individual endpoints.

Expanding a card places newly revealed cards beside it through `src/graph/incremental-layout.ts`. Existing cards keep their positions. The walk records which cards each expansion introduced, so Collapse and Undo expansion remove only that expansion's contribution. Walking to another centre starts a fresh canvas. Full pierce computes a bounded traversal in a worker and lays out the resulting cards through ELK.

The first view tries to fit the displayed graph while keeping column names readable. If that would shrink the text too far, it focuses on the centre and its neighbours, then on the centre alone if necessary. A tall centre card opens at its header and first rows. **Fit** explicitly fits all displayed cards and can zoom out further. It takes precedence over a pending first-view adjustment.

Selecting a column highlights its upstream and downstream paths and dims unrelated rows and lines. The **Selected path** panel lists the connected objects, fields and metrics in dependency order. Selecting a panel entry changes the highlighted path. **Clear the selected path** restores the unselected view. For semantic datasets and metrics, **Continue in Neighborhood** opens entity exploration.

## Validation

- The UBL graph contains 45 entities, 277 relationships and 183 directed parallel-link bundles, with selectable original definitions.
- Geometry tests assert every entity appears exactly once, has a parent, stays inside its parent, and overlaps no other entity after cleanup. The layered layout produces a route for every bundle.
- Collapse tests account for every original entity and relationship across visible links and folded internal links.
- Browser checks exercise the real workspace, full graph, both engines, area zoom, selection, return to overview, downloads, and large-model expansion. They capture screenshots under `/tmp`.
- Mutation checks include deliberately removing overlap cleanup and dropping entity nodes.

## Storage and identity

Documents live in the folder store: each project is a repository root or a declared subfolder of a shared repository, and an entity's identity is its document id (`<project>/<path>`) plus its path inside the document. Grouping corrections are saved per document as view state in the workbench state folder (outside the project folders, so they are not committed), never in the definitions, so export keeps the original bytes. The Neighborhood center and walk refer to entities by these ids, so they survive renames of other documents and a reload.

## Neighborhood, full screen and layout checks

The Neighborhood view projects a center with its incoming neighbors on the left and outgoing neighbors on the right, keeps links between neighbors as an option, pages hidden neighbors and keeps a walk history. Graph and Neighborhood can fill the screen (Fullscreen API, with a window-filling fallback); leaving restores the zoom and selection. The responsive suite checks every view from 390×844 to 2560×1440 for horizontal scroll, cut-off controls and floating overlays (mini-map, status line, bundle selector, toasts, inspector; zoom lives in the toolbar, not over the canvas) drawn over each other or over a control.

The graph engines are not OWL reasoners or SHACL validators. Layout positions are browser-session state; document export preserves the original definitions rather than exporting a screenshot.
