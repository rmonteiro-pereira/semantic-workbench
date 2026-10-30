/** Summarises how business areas link to each other, so a tile can say it instead of drawing every line. */

type Connection = { source: string; target: string };

/** Says whether a link joins two different areas. */
export function crossesAreas(connection: Connection, areaOf: (entityId: string) => string | undefined): boolean {
  const sourceArea = areaOf(connection.source);
  const targetArea = areaOf(connection.target);
  return sourceArea !== undefined && targetArea !== undefined && sourceArea !== targetArea;
}

/** For each area, the number of other areas that it has at least one link to. */
export function linkedAreaCounts(connections: Connection[], areaOf: (entityId: string) => string | undefined): Map<string, number> {
  const neighbours = new Map<string, Set<string>>();
  const remember = (area: string, other: string) => {
    const known = neighbours.get(area) ?? new Set<string>();
    known.add(other);
    neighbours.set(area, known);
  };
  for (const connection of connections) {
    if (!crossesAreas(connection, areaOf)) continue;
    const sourceArea = areaOf(connection.source)!;
    const targetArea = areaOf(connection.target)!;
    remember(sourceArea, targetArea);
    remember(targetArea, sourceArea);
  }
  return new Map([...neighbours].map(([area, others]) => [area, others.size]));
}

/** The words a tile shows for its links to other areas. */
export function linkedAreasText(count: number): string {
  if (count === 0) return 'no links to other areas';
  return count === 1 ? 'links to 1 area' : `links to ${count} areas`;
}
