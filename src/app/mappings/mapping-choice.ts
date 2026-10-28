/** The parts of a mapping option that decide which one the Mappings tab opens with. */
export type MappingChoice = { id: string; project?: string };

/**
 * Keeps the mappings of the open file's project. The app works on one project at a time, so
 * another project's mapping is never offered, and with no project open there is none.
 */
export function mappingsOfProject<Mapping extends MappingChoice>(
  mappings: Mapping[],
  openProject: string | undefined,
) {
  return mappings.filter(mapping => openProject !== undefined && mapping.project === openProject);
}

/**
 * Picks the mapping the tab opens with. A mapping defined in the open file wins, then the one
 * already selected if it belongs to the open file's project, then the first mapping of that
 * project. A project with no mapping keeps the previous choice, which it does not show: stepping
 * Back through it to the previous project then finds that project's concept and Show more intact.
 */
export function chooseMapping(
  mappings: MappingChoice[],
  openFileId: string | undefined,
  openProject: string | undefined,
  previousId: string,
) {
  const ofOpenFile = mappings.find(
    mapping => mapping.id === openFileId || mapping.id.startsWith(openFileId + '#'),
  );
  if (ofOpenFile) return ofOpenFile.id;
  const inProject = mappingsOfProject(mappings, openProject);
  if (!inProject.length) return previousId;
  const previous = inProject.find(mapping => mapping.id === previousId);
  return previous?.id ?? inProject[0]!.id;
}

/** The chosen mapping if the open project offers it, or none: another project's is never shown. */
export function shownMapping(offered: MappingChoice[], chosenId: string) {
  return offered.some(mapping => mapping.id === chosenId) ? chosenId : '';
}
