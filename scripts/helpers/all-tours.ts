// Every group of screens the responsive suite measures and the capture tools photograph, so a new
// tour is added in one place.
import { expect } from '@playwright/test';
import { graphScreens } from './graph-tour';
import { adminScreens } from './admin-tour';
import { revealGraphControls } from './graph-options';
import { graphControlsProblems } from './graph-paint-geometry';
import { fileTab } from './screen-tour';
import { editScreens } from './edit-tour';
import { dialogsTourScreens } from './dialogs-tour';
import { exportScreens } from './export-tour';
import { odcsScreens } from './odcs-tour';
import { projectDialogScreens } from './project-dialog-tour';
import { sparseScreens } from './sparse-tour';
import { tourScreens, type Screen } from './screen-tour';

/** Files the tours open. */
export type AllTourFiles = {
  ontology: string;
  contract: string;
  metricsModel: string;
  serverMode?: boolean;
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
      screens: projectDialogScreens(files.ontology),
    },
    {
      title: 'export dialog',
      summary: 'readable text, no overlaps, contained in the window',
      screens: exportScreens(files.ontology),
    },
    {
      title: 'file dialogs',
      summary: 'readable text and no overlaps',
      screens: dialogsTourScreens(files.ontology),
    },
    {
      title: 'folder dialogs',
      summary: 'readable text and no overlaps',
      screens: sparseScreens(files.serverMode),
    },
  ];
}

/** Files for complete visual captures, including a document with real concept mappings. */
export type CaptureFiles = AllTourFiles & { mapping: string };

/** Adds administration, mapping and full-screen views to the shared screen tours. */
export function captureScreens(files: CaptureFiles): Screen[] {
  const fullscreen = (tab: string): Screen => ({
    name: `ontology-${tab.toLowerCase()}-fullscreen`,
    show: async page => {
      await fileTab(files.ontology, tab)(page);
      await revealGraphControls(page);
      await page.getByRole('button', { name: 'Enter full screen', exact: true }).click();
      await expect(page.locator('.canvas-row.is-fullscreen')).toBeVisible();
      await revealGraphControls(page);
      expect(await graphControlsProblems(page)).toEqual([]);
      const controls = page.getByRole('button', { name: 'Controls', exact: true });
      if (await controls.isVisible()) await controls.click();
    },
  });
  return [
    ...tourGroups(files).flatMap(group => group.screens),
    { name: 'mapping-graph', show: fileTab(files.mapping, 'Graph') },
    {
      ...graphScreens(files.ontology).find(
        screen => screen.name === 'graph-neighborhood-hover-label',
      )!,
      name: 'ontology-neighborhood-hover-label',
    },
    {
      ...graphScreens(files.ontology).find(screen => screen.name === 'graph-neighborhood-labels')!,
      name: 'ontology-neighborhood-labels-zoomed',
    },
    fullscreen('Graph'),
    fullscreen('Neighborhood'),
    ...adminScreens(),
  ];
}
