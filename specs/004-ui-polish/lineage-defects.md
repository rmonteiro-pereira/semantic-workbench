# Lineage and ODCS graph defects (Graph tab of a contract, mapping lineage)

Seen in the strict audit screenshots at 390x844, 1280x720, 1440x900 and 2560x1440, light and dark,
for the commerce contract (4 tables) and the UBL contract (169 tables). Screenshots are named
`local-contract-graph-<size>`, `local-projects-<size>` (the UBL contract graph) in the audit folder.

1. At 1280 and 1440 the first view shows 2 of 7 cards (commerce) or 1 to 2 of 8 (UBL). At 2560 it
   shows 6 of 7. The default view depends on the window. (A-3, B-3, C-7, D-15)
2. The edge label box sits between two cards and touches both card borders and their handles,
   because the gap between columns is a fixed size, not sized from the label. (A-3, C-7)
3. At 2560 an edge label sits on the dashed curve and the curve runs under it. The label has no
   offset from the line. (A-5, C-8, D-16, B-3)
4. A dashed foreign-key curve runs along the border of the centre card and along the edge of the
   "9 more tables" card, and through the legend row at 1440. (B-3, D-15)
5. The grouped card "9 more tables" clips its own text ("shipment__consignment, ...") and is cut by
   the canvas bottom at 1440. (B-3, D-15)
6. Number bubbles (8, 5, 9, 2, 2) sit on bundled lines and nothing says what they count. (D-16)
7. Column type text is not in a fixed track: "string" starts at three different x positions
   depending on the badges of the row. (D-15)
8. The phone toolbar (find, full pierce, direction, undo, options, fit, zoom, hops, trail, card
   count) takes about 330 of 844 px; the canvas keeps 240 px and shows one card whose handles touch
   the viewport edges. (A-1, C-9)
9. The legend wraps to three lines at 390 and its text is 10 px at 2560. (A-1, C-9, D-16)
10. The toolbar says "Full pierce" and "Lineage options", words a reader cannot guess. The footer
    says "Workbench reading of declared names · 7 of 14 assets". (A-4)
11. "Group by" is labelled at 390 and 2560 but not at 1280 and 1440, where the select reads only
    "Auto: communities". (A-4, B-4, C-7, D-12)
12. At default zoom on a very large screen the cards cover a third of the canvas and text is small.
    (A-5, C-8)
13. The path text ("consignment -> shipment__consignment, ...") is one unwrapped run that is cut
    at the right edge. (D-15)
14. "1 of 7 cards shown" is not on the same line as its "Show all" link on a phone. (C-9)
15. The "React Flow" credit sits in the canvas corner at every size. (B-5, D-12)

Whole-model Graph and Neighborhood (same audit):

16. Whole-model Graph at fit zoom: names 4 to 7 px, hundreds of edges across every card and area.
    (B-1, D-1, D-2)
17. Whole-model footer: four facts in one line, "bundled", "Routing: background worker". (B-5, D-12)
18. Neighborhood at fit zoom: details 6 to 7 px, edges bunch into the centre card, long lanes cross
    the middle column, names cut, toolbar clipped at 390, first view cropped at 390.
    (B-2, D-3, D-4)
