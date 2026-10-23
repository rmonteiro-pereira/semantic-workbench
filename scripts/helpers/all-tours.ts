// Every group of screens the responsive suite measures and the capture tools photograph, so a new
// tour is added in one place.
import { editScreens } from './edit-tour';
import { odcsScreens } from './odcs-tour';
import { projectDialogScreens } from './project-dialog-tour';
import { sparseScreens } from './sparse-tour';
import { tourScreens, type Screen } from './screen-tour';

/** Files the tours open. */
export type AllTourFiles = {
  ontology: string;
  contract: string;
  metricsModel: string;
};

/** A named group of screens and what the suite says about it in its check names. */
export type TourGroup = { title: string; summary: string; screens: Screen[] };

/** Lists every tour: the main tabs, edit drawers, ODCS pages and the project dialogs. */
export function tourGroups(files: AllTourFiles): TourGroup[] {
  return [
    {
      title: 'screens',
      summary: 'readable text and no overlaps',
      screens: tourScreens({ ontology: files.ontology, contract: files.contract }),
    },
    {
      title: 'edit screens',
      summary: 'readable text and no overlaps',
      screens: editScreens({ ontology: files.ontology, metricsModel: files.metricsModel }),
    },
    {
      title: 'ODCS screens',
      summary: 'readable, no overlaps, tables fit',
      screens: odcsScreens(files.contract),
    },
    {
      title: 'project dialogs',
      summary: 'readable text and no overlaps',
      screens: projectDialogScreens(),
    },
    {
      title: 'folder dialogs',
      summary: 'readable text and no overlaps',
      screens: sparseScreens(),
    },
  ];
}
