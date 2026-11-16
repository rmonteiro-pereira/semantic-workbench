// Connects candidate publication writers to the existing Git working-copy proofs.
import { join } from 'node:path';
import { createWorktrees } from '../src/server/projects/worktrees';
import type { createPublication } from '../src/server/projects/publication';

/** Supplies a candidate writer while preserving the composed working-copy entry points. */
export function worktreesWithPublication(factory: typeof createPublication, options: Parameters<typeof createWorktrees>[0]) {
  return createWorktrees({
    ...options,
    publisher: factory({
      git: options.git,
      directory: repository => join(options.layout.projects, repository),
      pointers: options.publication?.pointers,
      readable: options.publication?.readable ?? (async () => {}),
      supersede: options.publication?.supersede ?? (() => {}),
      stage: options.publication?.stage,
    }),
  });
}
