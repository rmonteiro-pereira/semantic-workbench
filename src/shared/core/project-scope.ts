/** Scoping documents to one project: the server and the browser share these rules. */

/** The documents of one project, in their original order. */
export function documentsOfProject<Document extends { project?: string }>(documents: Document[], project: string) {
  return documents.filter(document => document.project === project);
}

/** The document a project opens with, or none when the project has no files. */
export function firstDocumentOfProject<Document extends { project?: string }>(documents: Document[], project: string) {
  return documentsOfProject(documents, project)[0] ?? null;
}
