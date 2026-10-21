# SQL regions: locations, dialects, positions

Shared by coloring (`src/editor/languages.ts`), lint (`src/sql/lint.ts`), the item editor,
the metric wizard and the API (`indexBytes`).

## Locations (JSON pointers, `*` = any index)

| Document kind | Pointer pattern | Dialect from |
| --- | --- | --- |
| Ossie semantic (flat) | `/datasets/*/fields/*/expression/dialects/*/expression`, `/metrics/*/expression/dialects/*/expression` | sibling `dialect` |
| Ossie semantic (legacy `semantic_model` list) | `/semantic_model/*/…` as above | sibling `dialect` |
| Ossie ontology, embedded model | `/ontology_mappings/*/semantic_model/…` as above | sibling `dialect` |
| Ossie mappings (standalone or embedded) | `…/object_mappings/*/expression`, `…/referent_mappings/*/expression`, `…/link_mappings/*/expression` (any depth under `concept_mappings`) | mapping's semantic model default: ANSI |
| ODCS | `/schema/*/quality/*/query`, `/schema/*/properties/**/quality/*/query`, `/quality/*/query` where sibling `type` = `sql` | first `servers[].type`, else ANSI |
| ODCS | `/schema/*/properties/**/transformLogic` | as above |

## Dialects

| Declared | Checked with | Coloring |
| --- | --- | --- |
| `ANSI_SQL`, `OSSIE_SQL_2026`, ODCS `postgres`/`postgresql`, none | PostgreSQL grammar | Standard SQL |
| `SNOWFLAKE`, ODCS `snowflake` | snowflake grammar | Standard SQL |
| `BIGQUERY`, ODCS `bigquery` | bigquery grammar | Standard SQL |
| `DATABRICKS`, ODCS `databricks` | hive grammar (closest available) | Standard SQL |
| ODCS `mysql`, `sqlserver`, `trino`, `redshift`, `athena`, `db2` | matching grammar | Standard SQL |
| `MDX`, `DAX`, `MAQL`, `TABLEAU`, `SIGMA`, `THOUGHTSPOT`, `HOLISTICS_AQL` | not checked (info note) | plain |

Expressions are checked as the select list of `SELECT <expression>`; quality `query` and
`transformLogic` as full statements. `${name}` placeholders become same-length identifiers.

## Position mapping

For a value character at index `i`, `offsets[i]` is its offset in the file:

| Style | Rule |
| --- | --- |
| block literal `\|` (with indentation indicator or chomping) | per content line, skip the block's indentation; line breaks map to the line break |
| block folded `>` | as literal; a folded line break (value space) maps to the line break it replaced |
| plain multi-line | leading spaces of continuation lines skipped; folded breaks as above |
| single-quoted | `''` maps both value characters' positions to the first quote |
| double-quoted / JSON | escapes (`\"`, `\\`, `\n`, `\t`, `\uXXXX`, YAML `\x`, `\U`) map to the backslash |

`line`/`column` are 1-based from the file offset. If the parser reports no usable position, the
finding goes to `offsets[0]`.

## Fixtures (tests/fixtures/sql/)

- `case-when.ossie.yaml`: the `occupancy_rate` metric of spec Story 4 scenario 1 (no finding).
- `case-when-broken.ossie.yaml`: same without `END`; expected finding at the `)` closing
  `SUM(CASE …` on line 6 (hand-computed column recorded in the test).
- `escaped.semantic.json`: `"SUM(CASE WHEN status = \"open\" THEN 1 END)"` and a broken twin.
- `folded.ossie.yaml`: `>` scalar spanning three lines with an error on the third.
- `quality.odcs.yaml`: `type: sql` with `${table}`/`${column}` placeholders; a `DAX` expression.
