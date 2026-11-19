// Faults in the decisions that keep a shared proposal inside its declared projects, its authority
// and its place in the publication path. Each is paired with the focused cases in
// proposals-mutation-cases.ts.
/** Deliberate proposal faults: category, file, the text to change and what replaces it. */
export const proposalsMutants: [string, string, string, string][] = [
  // Contributing: the tip the person reviewed, the declared set, per-file authority and the guard.
  ['proposals', 'src/server/projects/proposal-contribution.ts', 'if (tip !== expectedTip) throw', 'if (false) throw'],
  ['proposals', 'src/server/projects/proposal-contribution.ts', 'if (scope.outside.length || scope.projectless.length)', 'if (false)'],
  ['proposals', 'src/server/projects/proposal-contribution.ts', 'caller.authority.files(scope.inside.map(file => ({ project: file.project, path: file.path })));', ''],
  ['proposals', 'src/server/projects/proposal-contribution.ts', "caller.reader.guard?.(await deps.changes(slug, tip, head, paths), { operation: 'contribute' });", ''],
  // Promoting: authority over every project of the repository, and the tip the promoter reviewed.
  ['proposals', 'src/server/auth/proposal-access.ts', 'projectResources(input.repositoryProjects)', 'projectResources(input.declaredProjects)'],
  ['proposals', 'src/server/projects/proposal-promotion.ts', "caller.authority.check('promote', await context.facts(repository, record));", ''],
  ['proposals', 'src/server/projects/proposal-promotion.ts', 'if (tip !== expectedTip) throw', 'if (false) throw'],
  // Promotion rides the publication path: fast-forward only, and one writer of the default ref.
  ['proposals', 'src/server/projects/publication-checks.ts', 'if (candidate.previous && !(await deps.isAncestor(candidate.repo, candidate.previous, candidate.next))) {', 'if (false) {'],
  [
    'proposals',
    'src/server/projects/worktrees.ts',
    'const result = await moveDefault(context, repo, { branch, previous, next: tip }, check, advance);',
    "await git.run(baseDir(context, repo), ['update-ref', 'refs/heads/' + branch, tip]);\n  const result = { published: branch, previous, commit: tip };",
  ],
  // Nothing in progress leaves the workbench: the rule itself, its prefixes and letter case, the
  // call from push and sync, and the refspec of a push.
  ['proposals', 'src/server/projects/work-in-progress-push.ts', 'if (isWorkInProgressBranch(branch)) throw new BadRequestError(WORK_IN_PROGRESS_MESSAGE);', ''],
  ['proposals', 'src/server/projects/work-in-progress-push.ts', "const WORK_IN_PROGRESS_PREFIXES = ['work/', 'proposal/'];", "const WORK_IN_PROGRESS_PREFIXES = ['work/'];"],
  ['proposals', 'src/server/projects/work-in-progress-push.ts', "const folded = branch.normalize('NFC').toLowerCase();", 'const folded = branch;'],
  ['proposals', 'src/server/projects/scm-remote.ts', 'let refspec = await approvedRefspec(slug, head, branch);', 'let refspec = head + ":refs/heads/" + branch;'],
  [
    'proposals',
    'src/server/projects/scm-remote.ts',
    "['push', '--no-mirror', '--no-follow-tags', '--recurse-submodules=no', '--end-of-options', chosenName(choice), refspec]",
    "['push', '--no-mirror', '--no-follow-tags', '--recurse-submodules=no', '--end-of-options', chosenName(choice), refspec, 'refs/workbench/*:refs/workbench/*']",
  ],
];
