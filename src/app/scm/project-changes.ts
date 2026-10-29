/** Source Control lists the changes of the selected project, even in a repository shared by many. */
import type { GitChange } from '../projects/api';

/**
 * Splits a repository's changes into those inside the selected project and a count of the rest.
 * The rest belong to other projects of the repository or to no project; Stage all, Unstage all and
 * Commit still act on the whole repository, so the count tells the person they are there.
 */
export function changesOfProject(changes: GitChange[]) {
  const inProject = changes.filter(change => !change.outside);
  return { inProject, elsewhere: changes.length - inProject.length };
}

/** The sentence that says how many changes of the repository are not listed. */
export function elsewhereLine(elsewhere: number) {
  const noun = elsewhere === 1 ? 'change' : 'changes';
  return `${elsewhere} ${noun} in other projects of this repository ${elsewhere === 1 ? 'is' : 'are'} ` + 'not listed. Stage all, Unstage all and Commit apply to the whole repository.';
}
