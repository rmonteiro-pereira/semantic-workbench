// Deliberate faults in immutable publication selection and validation.
/** Targeted publication faults exercised by the mutation gate. */
export const snapshotMutants: [string, string, string, string][] = [
  ['snapshot-pointer', 'src/server/projects/published-pointer.ts', "return (await isAncestor(pointer.commit, ref)) ? 'fast-forward' : 'diverged';", "return 'fast-forward';"],
  ['snapshot-checks', 'src/server/projects/publication-checks.ts', 'candidate.previous && !(await deps.isAncestor(candidate.repo, candidate.previous, candidate.next))', 'false'],
  ['snapshot-checks', 'src/server/projects/publication-checks.ts', 'await deps.readable(candidate);', 'void candidate;'],
  ['snapshot-checks', 'src/server/projects/publication-checks.ts', '    async candidate => {\n      try {', '    async candidate => {\n      await deps.guard(candidate);\n      try {'],
  [
    'snapshot-index',
    'src/server/projects/snapshot-index.ts',
    'const blobs = await deps.git.catFileBatch(\n    directory,\n    files.map(file => file.id),\n    limits,\n  );',
    "const blobs = new Map(await Promise.all(files.map(async file => [file.id, new Uint8Array(await Bun.file(directory + '/' + file.path).arrayBuffer())] as const))));",
  ],
  ['snapshot-resolver', 'src/server/projects/published-snapshot.ts', 'const chosen = requestPin.commits.get(repository);', 'const chosen = pin().commits.get(repository);'],
  ['snapshot-resolver', 'src/server/projects/published-snapshot.ts', 'if (!keep.has(key)) retained.delete(key);', 'void key;'],
  ['snapshot-resolver', 'src/server/projects/published-snapshot.ts', 'JSON.stringify([repository, commit, folderDigest(projects)])', 'JSON.stringify([repository, commit])'],
];
