// Names the private branch a person works on for a proposal, and tells whose it is. A handle never
// holds a dot and an identifier never does either, so the name splits at the first dot.
import { isProposalId } from './proposal';

/** The folder of branch names that belong to people's working copies. */
const WORK_PREFIX = 'work/';

const fold = (name: string) => name.normalize('NFC').toLowerCase();

/** The contribution branch of one person for one proposal: `work/<handle>.<id>`. */
export const contributionBranch = (handle: string, proposalId: string) => `${WORK_PREFIX}${handle}.${proposalId}`;

/** The handle and proposal identifier a contribution branch names, or null for any other name. */
export function parseContributionBranch(name: string): { handle: string; proposalId: string } | null {
  const lowered = fold(name);
  if (!lowered.startsWith(WORK_PREFIX)) return null;
  const rest = lowered.slice(WORK_PREFIX.length);
  const dot = rest.indexOf('.');
  if (dot <= 0) return null;
  const handle = rest.slice(0, dot);
  const proposalId = rest.slice(dot + 1);
  return isProposalId(proposalId) ? { handle, proposalId } : null;
}

/**
 * Whether a branch is a contribution branch of the person whose own personal branch is given: the
 * personal branch name, then a dot, then a proposal identifier. The workbench's case folding applies.
 */
export function ownsContributionBranch(ownPersonalBranch: string | null, name: string) {
  if (ownPersonalBranch === null) return false;
  const parsed = parseContributionBranch(name);
  if (!parsed) return false;
  return fold(ownPersonalBranch) === `${WORK_PREFIX}${parsed.handle}`;
}
