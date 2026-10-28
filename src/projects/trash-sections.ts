/** The trash shows the selected project's deleted files apart from whole deleted projects. */
import type { TrashItem } from './api';

/**
 * Splits trash entries into the deleted files of the selected project and the deleted projects.
 * A file deleted from another project is not listed, as it belongs to that project's context;
 * `otherProjectFiles` counts them so the list can say they exist.
 */
export function trashSections(items: TrashItem[], selectedProject: string) {
  const files = items.filter(item => item.kind === 'file' && item.project === selectedProject);
  const projects = items.filter(item => item.kind !== 'file');
  return { files, projects, otherProjectFiles: items.length - files.length - projects.length };
}

/** The sentence that says how many deleted files of other projects are not listed. */
export function otherProjectFilesLine(count: number) {
  const noun = count === 1 ? 'deleted file' : 'deleted files';
  return `${count} ${noun} in other projects ${count === 1 ? 'is' : 'are'} not listed.`;
}
