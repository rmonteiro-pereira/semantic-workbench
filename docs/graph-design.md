# Graph rendering and layout decisions

The overview, relationship matrix and actual graph are complementary representations. The overview and matrix remain available; they do not replace the graph. The Graph tab contains the model's entities and directed relationships. Large models can collapse business areas and expand them again.

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
3. Use the established UBL display groups, or definition types for other inputs. These are display groupings, not new standard semantics.
4. Offer **Network (fCoSE)** and **Layered (ELK)** layouts.
5. For network layout, remove residual overlaps with ELK SPOrE and pack area rectangles with ELK's box packer. Tests check actual rectangle intersections and containment.
6. Render compound areas and entity nodes in React Flow, with controlled node state, memoized node/edge components, viewport culling, area zoom, mini-map navigation and manual dragging.
7. Use inexpensive native routes at whole-model zoom, and route around nodes through a shared background worker for visible or selected connections at detail zoom. Show names on hover/selection, with an optional label toggle. Highlight connected entities without removing the remainder of the model.
8. Models above 250 visible business entities open with collapsed areas. Area counts expose the folded entities; clicking one expands that area. **Expand all** restores the full graph. Internal relationships are folded into the area count, and remain accessible after expansion; they are not deleted from the source.
9. Fit the whole model for spatial orientation, then zoom to an area or entity for reading. A finite viewport cannot show arbitrarily many full-size entity labels simultaneously.

## Validation

- The UBL graph contains 45 entities, 277 relationships and 183 directed parallel-link bundles, with selectable original definitions.
- Geometry tests assert every entity appears exactly once, has a parent, stays inside its parent, and overlaps no other entity after cleanup. The layered layout produces a route for every bundle.
- Collapse tests account for every original entity and relationship across visible links and folded internal links.
- Browser checks exercise the real workspace, full graph, both engines, area zoom, selection, return to overview, downloads, and large-model expansion. They capture screenshots under `/tmp`.
- Mutation checks include deliberately removing overlap cleanup and dropping entity nodes.

The graph engines are not OWL reasoners or SHACL validators. Layout positions are currently browser-session state; document export preserves the original definitions rather than exporting a screenshot.
