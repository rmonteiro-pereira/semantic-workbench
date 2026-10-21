/** Smart-edge routes use absolute SVG commands. Never publish a cached path
 * whose endpoints belong to an earlier node position. */
export function pathMatchesEndpoints(
  path: string,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  tolerance = 0.01,
) {
  if (![sourceX, sourceY, targetX, targetY, tolerance].every(Number.isFinite) || tolerance < 0)
    return false;
  // Relative commands cannot be compared by reading the last coordinate pair.
  if (!/^\s*M(?:\s|[-+.\d])/.test(path) || /[mlhvcsqtazHVZ]/.test(path)) return false;
  const coordinates =
    path.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)?.map(Number) ?? [];
  if (coordinates.length < 4 || !coordinates.every(Number.isFinite)) return false;
  const last = coordinates.length - 2;
  return (
    Math.abs(coordinates[0] - sourceX) <= tolerance &&
    Math.abs(coordinates[1] - sourceY) <= tolerance &&
    Math.abs(coordinates[last] - targetX) <= tolerance &&
    Math.abs(coordinates[last + 1] - targetY) <= tolerance
  );
}
