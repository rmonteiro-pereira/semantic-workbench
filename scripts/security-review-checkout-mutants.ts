// Faults for the scanner's case check, the start-up restore, the audit mirror checks and the
// branch name comparisons, apart from the other data access mutants.

/** Mutants share the tuple shape of the existing mutation inventory. */
export const checkoutMutants: [string, string, string, string][] = [
  // The scanner keeps only index paths spelled as the disk spells them.
  ['secrev-scanner', 'src/server/projects/scanner.ts', 'assertExactCase(dir, path, listOnce);', ''],
  ['secrev-scanner', 'src/server/projects/scanner.ts', 'if (error instanceof CaseVariantError) continue;', 'throw error;'],
  ['secrev-scanner', 'src/server/projects/scanner.ts', 'if (!listings.has(folder)) {', 'if (true) {'],
  // Start-up restores only deletions that the trash explains.
  ['secrev-published', 'src/server/projects/published-checkout.ts', 'if (deletion && trashed.has(entry.path))', 'if (deletion)'],
  ['secrev-published', 'src/server/projects/published-checkout.ts', "const isDeletion = (code: string) => code === 'D' || code === '.';", 'const isDeletion = () => true;'],
  ['secrev-published', 'src/server/projects/published-checkout.ts', 'if (unexplained.length) throw new PublishedCheckoutChangedError(repo, unexplained);', ''],
  ['secrev-published', 'src/server/projects/published-checkout.ts', "['restore', '--staged', '--worktree', '--', ...explained]", "['restore', '--', ...explained]"],
  ['secrev-published', 'src/server/projects/published-checkout.ts', 'if (!explained.length) return [];', ''],
  // The audit mirror is checked as well as the chain.
  ['secrev-audit-mirror', 'src/server/auth/audit.ts', 'if (month === undefined || month < oldest) continue;', 'if (month === undefined) continue;'],
  ['secrev-audit-mirror', 'src/server/auth/audit.ts', 'if (!known.has(sha256(line.trimEnd()))) {', 'if (false) {'],
  ['secrev-audit-mirror', 'src/server/auth/audit.ts', 'retentionDays * 86_400_000', '0 * retentionDays'],
  [
    'secrev-audit-mirror',
    'src/server/auth/audit.ts',
    'else if (line.startsWith(\'{"\') && line.includes(\'"type":"audit"\')) records.push(line);',
    'else if (line.includes(\'"type":"audit"\')) records.push(line);',
  ],
  ['secrev-audit-mirror', 'src/server/auth/audit.ts', 'if (lost) return { ok: false, ...lost };', ''],
  // Branch names are compared without regard to letter case.
  ['secrev-worktrees', 'src/server/projects/worktrees.ts', 'foldBranch(branch).startsWith(PERSONAL_BRANCH_PREFIX)', 'branch.startsWith(PERSONAL_BRANCH_PREFIX)'],
  ['secrev-worktrees', 'src/server/projects/worktrees.ts', '(own !== null && sameBranchName(name, own))', '(own !== null && name === own)'],
  ['secrev-worktrees', 'src/server/projects/worktrees.ts', 'if (existing.includes(name)) return undefined;', ''],
  ['secrev-worktrees', 'src/server/projects/worktrees.ts', 'existing.find(other => sameBranchName(other, name))', 'existing.find(other => other === name)'],
  ['secrev-hooks', 'src/server/projects/working-copies.ts', 'sameBranchName(branch, mine)', 'branch === mine'],
  ['secrev-scm-switch', 'src/server/projects/scm.ts', 'if (clash)', 'if (false)'],
  ['secrev-trash-routes', 'src/server/routes/trash.ts', "Object.keys(body).some(key => key !== 'domain')", 'false'],
  ['secrev-trash-routes', 'src/server/routes/trash.ts', 'await restoring(context, target, body, undone)', 'await restoring(context, target, {}, undone)'],
];
