// Specifies faults that must change the browser comparison or what a caller can see.
import { resolve } from 'node:path';

/** Mutations of side selection, item pairing, recorded renames and branch visibility. */
export const itemDiffMutants: [string, string, string, string][] = [
  [
    'item-diff-selection',
    'src/server/projects/item-diff.ts',
    "if (side.name === 'working') return readers.working(project, reader);",
    "if (side.name === 'working') return readers.published(project, reader);",
  ],
  ['item-diff-address', 'src/shared/item-diff/compare-items.ts', 'newItems.get(target)?.[0]', 'after.find(item => item.name === previous.name || item.kind === previous.kind)'],
  ['item-diff-migration', 'src/shared/item-diff/compare-items.ts', 'migrateAddress(address, [record], false)', 'address'],
  ['item-diff-access', 'src/server/auth/item-diff-access.ts', 'branchShownTo(branch, own, remote)', 'Boolean(branch)'],
];

if (import.meta.main) {
  const processResult = Bun.spawn([process.execPath, resolve('scripts/mutation-tests.ts'), '--item-diff'], { stdout: 'inherit', stderr: 'inherit' });
  process.exit(await processResult.exited);
}
