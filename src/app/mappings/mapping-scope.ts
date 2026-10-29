/** Decides which mappings the Mappings tab shows for the open file. */
import type { Doc } from '../projects/api';
import { projectFiles } from '../odcs/project-files';

/** The parts of a mapping option that decide whether the tab shows it. */
export type MappingChoice = { id: string; project?: string };

/** Keeps the mappings of the selected project. Another project's mapping is never shown, and with no project open there is none. */
export function mappingsOfProject<Mapping extends MappingChoice>(mappings: Mapping[], project: string | undefined) {
  return mappings.filter(mapping => project !== undefined && mapping.project === project);
}

/** Tells whether a mapping is defined inside the file: the file itself, or a mapping embedded in it. */
export function isDefinedIn(mapping: MappingChoice, fileId: string | undefined) {
  return fileId !== undefined && (mapping.id === fileId || mapping.id.startsWith(fileId + '#'));
}

/**
 * Picks the mappings to load for the open file. A mapping document shows its own mapping. For any
 * other file the project's mappings are candidates, and `coveringMappings` keeps those that use the file.
 */
export function candidateMappings<Mapping extends MappingChoice>(mappings: Mapping[], project: string | undefined, openFileId: string | undefined) {
  const inProject = mappingsOfProject(mappings, project);
  const ofOpenFile = inProject.filter(mapping => isDefinedIn(mapping, openFileId));
  return ofOpenFile.length > 0 ? ofOpenFile : inProject;
}

/** The documents a loaded mapping reads, as the agent API reports them. */
export type MappingDocuments = { documentId: string }[];

/** Keeps the mappings that are defined in the open file or read it as their ontology or semantic model. */
export function coveringMappings<Loaded extends { option: MappingChoice; documents: MappingDocuments }>(loaded: Loaded[], openFileId: string | undefined) {
  return loaded.filter(entry => isDefinedIn(entry.option, openFileId) || entry.documents.some(document => document.documentId === openFileId));
}

/** Names the data contract files among the documents of one project: the physical sources of its datasets. */
export function dataContractFilenames(documents: Doc[]) {
  const contractPaths = new Set(
    projectFiles(documents)
      .filter(file => file.data.kind === 'DataContract')
      .map(file => file.path),
  );
  return documents.filter(document => contractPaths.has(document.path)).map(document => document.filename);
}
