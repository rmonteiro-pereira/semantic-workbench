# ODCS graph defects (Graph tab of a contract)

Captured before the fix at 390x844, 1280x720, 1440x900 and 2560x1440 for the commerce example
(4 tables), the mall contract (142 tables) and the UBL contract (169 tables). Screenshots are in
`screenshots/before/`.

1. The first view crops cards: customers is cut at the left edge and order_lines at the top right,
   so no card is whole next to the centre. `odcs-commerce-graph-1280`
2. The layout is four layers wide (customers, orders, order_lines and the semantic orders dataset,
   metrics), so a 1280 px window can never show the neighbours whole at a readable size.
   `odcs-commerce-graph-1280`, `odcs-commerce-graph-1440`
3. On a phone only the centre card shows, with 40 px of empty canvas above and below it and no hint
   that other tables are connected. `odcs-commerce-graph-390`
4. Foreign-key edges carry no label, so the reader cannot tell which column references which.
   `odcs-commerce-graph-2560`
5. Parallel edges repeat the word "lines" ("16 lines", "2 lines") and the label sits on top of the
   dashed edges and next to cards. `odcs-mall-graph-1440`, `odcs-mall-graph-2560`
6. Wide tables show ten rows, "3 more columns" or "93 more columns", and page buttons "1 2 ... 11".
   `odcs-mall-graph-1440`, `odcs-ubl-graph-1440`, `odcs-ubl-graph-390`
7. Page buttons overlap the card bottom edge and the React Flow credit at 390 px.
   `odcs-ubl-graph-390`
8. Dozens of dashed foreign-key lines fan out of one row of the centre card and cross other cards,
   which hides which tables are directly connected. `odcs-mall-graph-1440`, `odcs-mall-graph-2560`
9. Cards at the right edge are cut mid-row (badges "Req" and "U" are truncated), so half-cut cards
   show in the middle of the work area. `odcs-mall-graph-2560`
10. Lines run through unrelated cards (portfolios to organizations passes behind the "17 more
    tables" card). `odcs-mall-graph-2560`
11. The legend is one run of small symbols under the canvas; it has no key for the PK and FK
    badges and no key for what the dashed and solid lines mean in words. `odcs-commerce-graph-1280`
12. The foreign-key step selector hides inside the Lineage options dialog under the name
    "Foreign-key steps", with no sentence about what a step is. `odcs-commerce-graph-1280`
13. The toolbar wraps to four rows on a phone (search, pierce, zoom, full screen), so the canvas
    gets less than a third of the screen. `odcs-commerce-graph-390`, `odcs-ubl-graph-390`
14. The trail shows only the table names; the foreign-key path the reader walked is not readable as
    a sentence. `odcs-commerce-graph-1280`
15. Cards of 400 px with a type column leave little room for column names at the narrowest
    layout; rows read as three loose columns (name, type, badges). `odcs-ubl-graph-1440`
