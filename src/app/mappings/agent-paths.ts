/** Agent API addresses. Every request names the project it works in. */

/** The address that lists the mappings of one project. */
export function agentCatalogPath(project: string) {
  return `/api/agent/catalog?project=${encodeURIComponent(project)}`;
}

/** The address that reads one mapping's context, resolved inside its project and narrowed to a concept when one is named. */
export function agentContextPath(project: string, mappingId: string, concept = '') {
  const query = new URLSearchParams({ project, mappingId });
  if (concept) query.set('concept', concept);
  return `/api/agent/context?${query}`;
}
