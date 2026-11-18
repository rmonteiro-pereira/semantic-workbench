/** Orders list rows by their request counts. */

/** Sorts a copy of the rows with the busiest first; rows with equal counts keep the order they came in. */
export function sortByTraffic<Row>(rows: readonly Row[], countOf: (row: Row) => number): Row[] {
  return rows
    .map((row, position) => ({ row, position, count: countOf(row) }))
    .sort((left, right) => right.count - left.count || left.position - right.position)
    .map(entry => entry.row);
}
