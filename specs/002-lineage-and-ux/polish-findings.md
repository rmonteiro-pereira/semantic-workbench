# UI polish findings (v0.3.0)

Findings for the full UI polish pass, with their screenshots and, once fixed, the fix. Collected
during implementation and from owner/coordinator review; the polish pass adds its own sweep.

| # | Where | Finding | Screenshot | Status |
| --- | --- | --- | --- | --- |
| 1 | Mapping graph toolbar | The options button still reads "Lineage options…" on the mapping graph; use a neutral label ("Graph options…") or one per graph. | /tmp/workbench-mapping-graph-mall-1440.png | open |
| 2 | Status footer on a mapping file | Reads "167 entities · 0 relationships", contradicting the mapping lines shown; show counts for the current graph (cards, mappings). | /tmp/workbench-mapping-graph-mall-1440.png | open |
| 3 | Mapping graph first view on a metric | When the first view centres on a metric, also show the dataset(s) the metric reads, so concept → dataset → metric is visible at step 1. | /tmp/workbench-mapping-graph-mall-1440.png | open |
| 4 | Neighborhood after Full pierce | Lines between nodes in non-adjacent columns are routed as lanes around the whole canvas (large rectangles). Pierce now draws only the lines that reached each node; check the remaining lane routes on expansions. | /tmp/workbench-neighborhood-pierce-budget.png | open |
| 5 | Metric wizard step strip | At 390 and 1440 px the eight steps run past the drawer edge ("7 Explanatio…" cut, steps 5–8 off-screen at 390) with no visible scroll cue; wrap the steps or show a compact "Step 3 of 8" strip. | scratchpad p7-wizard-390.png, p7-wizard-1440.png | open |
