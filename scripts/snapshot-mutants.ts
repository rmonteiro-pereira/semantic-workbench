// Deliberate faults in immutable publication selection and validation.
/** Targeted publication faults exercised by the mutation gate. */
export const snapshotMutants: [string, string, string, string][] = [
  ['snapshot-pointer', 'src/server/projects/published-pointer.ts', "return (await isAncestor(pointer.commit, ref)) ? 'fast-forward' : 'diverged';", "return 'fast-forward';"],
];
