/** Agent API addresses. Every request names the project it works in. */

/** The address that lists the mappings of one project. */
export function agentCatalogPath(project: string) {
  return `/api/agent/catalog?project=${encodeURIComponent(project)}`;
}

/** The address that reads one mapping's context, resolved inside its project. */
export function agentContextPath(project: string, mappingId: string) {
  const query = new URLSearchParams({ project, mappingId });
  return `/api/agent/context?${query}`;
}
