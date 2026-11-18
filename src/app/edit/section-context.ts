// What a section of the details panel needs to read and write one ontology item: its document, where the item sits and how to hand saved files back to the workspace.
import { createContext } from 'react';
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
  /** True when the Source tab holds changes that are not saved, which a section write would overwrite. */
  dirty?: boolean;
};

/** The note shown in place of the controls while the Source tab holds unsaved changes. */
export const UNSAVED_SOURCE_NOTE = 'Save or discard the unsaved changes in the Source tab first. Changes made here would replace them.';

/** What the workspace gives the details panel so its sections can read and save documents. */
export type SectionSupport = {
  documentOf: (docId: string) => any;
  projectDocsOf: (docId: string) => Doc[];
  applySaved: (saved: Saved[], label: string) => void;
};

/** Carries the workspace's edit support through the details panel. */
export const ItemSectionSupportContext = createContext<SectionSupport | null>(null);
