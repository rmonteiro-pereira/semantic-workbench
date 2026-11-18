// What a section of the details panel needs to read and write one ontology item: its document, where the item sits and how to hand saved files back to the workspace.
import type { Path } from '../../shared/edit/item-model';
import type { Doc } from '../projects/api';
import type { Saved } from './ItemEditor';

/** The item a section shows and the means to save a change to it. */
export type DetailsSection = {
  doc: Doc;
  /** The parsed document, which sections only read. */
  document: any;
  itemPath: Path;
  projectDocs: Doc[];
  applySaved: (saved: Saved[], label: string) => void;
  openConcept?: (name: string) => void;
};
