// Deliberate faults in immutable publication selection and validation.
/** Targeted publication faults exercised by the mutation gate. */
export const snapshotMutants: [string, string, string, string][] = [
  ['snapshot-pointer', 'src/server/projects/published-pointer.ts', "return (await isAncestor(pointer.commit, ref)) ? 'fast-forward' : 'diverged';", "return 'fast-forward';"],
  ['snapshot-checks', 'src/server/projects/publication-checks.ts', 'candidate.previous && !(await deps.isAncestor(candidate.repo, candidate.previous, candidate.next))', 'false'],
  ['snapshot-checks', 'src/server/projects/publication-checks.ts', 'await deps.readable(candidate);', 'void candidate;'],
  ['snapshot-checks', 'src/server/projects/publication-checks.ts', '    async candidate => {\n      try {', '    async candidate => {\n      await deps.guard(candidate);\n      try {'],
];
