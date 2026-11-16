/** The trash shows the selected project's deleted files apart from whole deleted projects. */
import type { TrashItem } from './api';

/** Splits deleted files by their project and keeps whole deleted projects separate. */
export function trashSections(items: TrashItem[], selectedProject: string) {
  const files = items.filter(item => item.kind === 'file' && item.project === selectedProject);
  const projects = items.filter(item => item.kind !== 'file');
  const otherFiles = items.filter(item => item.kind === 'file' && item.project !== selectedProject);
  return { files, projects, otherProjectFiles: otherFiles.length, otherFiles };
}

/** The sentence that says how many deleted files of other projects are not listed. */
export function otherProjectFilesLine(count: number) {
  const noun = count === 1 ? 'deleted file' : 'deleted files';
  return `${count} ${noun} in other projects ${count === 1 ? 'is' : 'are'} not listed.`;
}
