/** The parts of a mapping option that decide which one the Mappings tab opens with. */
export type MappingChoice = { id: string; project?: string };

/**
 * Picks the mapping the tab opens with. A mapping defined in the open file wins, then the one
 * already selected if it belongs to the open file's project, then the first mapping of that
 * project. Only when the project has no mapping does it fall back to any other one, because
 * showing another project's mapping next to an unrelated file reads as a broken, empty view.
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
  const inProject = mappings.filter(mapping => !openProject || mapping.project === openProject);
  const previous = mappings.find(mapping => mapping.id === previousId);
  if (previous && inProject.includes(previous)) return previous.id;
  if (inProject[0]) return inProject[0].id;
  return previous?.id ?? mappings[0]?.id ?? '';
}
