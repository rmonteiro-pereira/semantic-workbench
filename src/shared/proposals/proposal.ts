// What a shared proposal is: the durable record, the view a reader receives, the rules for its name
// and identifier, and how its status follows from the record and the Git refs. Pure, no I/O.

/** Where a proposal stands for people: open and closed ones hold a Git ref, a promoted one is published. */
export type ProposalStatus = 'open' | 'closed' | 'promoted';

/** Open proposals allowed in one repository; assumed, since a repository has tens of people. */
export const MAX_OPEN_PROPOSALS = 50;
/** Longest proposal name; assumed, so a name still fits a list row on a phone once it wraps. */
export const MAX_NAME_LENGTH = 80;
/** Longest identifier; assumed, so `work/<handle>.<id>` stays well under Git's path limits. */
export const MAX_ID_LENGTH = 40;

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const hasControlCharacter = (text: string) => [...text].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);

/** Who changed a proposal's outcome, when, and the commits involved. */
export type ProposalOutcome = {
  by: string;
  at: string;
  tip: string;
  /** Promotion only: the published commit before and after. */
  previousPublished?: string | null;
  published?: string;
};

/** One person's last contribution, kept for display. */
export type Contributor = { id: string; name: string; at: string };

/** The durable record of one proposal; the tip is never stored, it is the Git ref. */
export type ProposalRecord = {
  id: string;
  name: string;
  projects: string[];
  base: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  status: ProposalStatus;
  outcome?: ProposalOutcome;
  contributors: Contributor[];
};

/** The whole state file of one repository. */
export type ProposalFile = { formatVersion: 1; proposals: ProposalRecord[] };

/** What the Git refs say about one proposal. */
export type ProposalRefState = {
  openTip: string | null;
  closedTip: string | null;
  /** Whether the open tip is contained in the published history. */
  openTipPublished: boolean;
};

/** A proposal's standing once record and refs are read together. */
export type DerivedStatus = ProposalStatus | 'damaged' | 'unregistered';

/** Why a name or a set of projects was refused. */
export class ProposalInputError extends Error {}

/** Trims a name and checks its length and characters. */
export function validateName(value: unknown): string {
  if (typeof value !== 'string') throw new ProposalInputError('Give the proposal a name.');
  const name = value.trim();
  if (!name) throw new ProposalInputError('Give the proposal a name.');
  if ([...name].length > MAX_NAME_LENGTH) throw new ProposalInputError(`A proposal name has at most ${MAX_NAME_LENGTH} characters.`);
  if (hasControlCharacter(name)) throw new ProposalInputError('A proposal name cannot contain control characters.');
  return name;
}

/** Whether a value is a well-formed proposal identifier. */
export const isProposalId = (value: unknown): value is string => typeof value === 'string' && value.length <= MAX_ID_LENGTH && ID_PATTERN.test(value);

/** Lower case ASCII words joined by dashes, shortened to leave room for a clash suffix. */
function slugOf(name: string) {
  const plain = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const words = plain.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return words.slice(0, MAX_ID_LENGTH - 4).replace(/-+$/g, '') || 'proposal';
}

/** An identifier from the name, with a number added when the repository already uses it. */
export function deriveId(name: string, taken: ReadonlySet<string>): string {
  const base = slugOf(name);
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * The standing of a proposal. A record without refs is damaged, a ref without a record is
 * unregistered, and an open tip that already sits in the published history, after the proposal
 * was contributed to, means promotion finished before the record was updated.
 */
export function deriveStatus(record: ProposalRecord | null, refs: ProposalRefState): DerivedStatus {
  if (!record) return 'unregistered';
  if (record.status === 'promoted') return 'promoted';
  if (record.status === 'closed') return refs.closedTip ? 'closed' : 'damaged';
  if (!refs.openTip) return 'damaged';
  if (refs.openTipPublished && refs.openTip !== record.base) return 'promoted';
  return 'open';
}

/** How one file differs between two commits. */
export type ChangeStatus = 'added' | 'changed' | 'removed';

/** A file changed between two commits; a rename is a removal and an addition. */
export type ChangedPath = { path: string; status: ChangeStatus };

/** The changed files of one declared project, as a reader may see them. */
export type ProposalChange = { project: string; files: { path: string; status: ChangeStatus }[] };

/** The actions the reader's authority allows on a proposal. */
export type ProposalPermissions = { contribute: boolean; promote: boolean; close: boolean; restore: boolean };

/** A declared project the reader may read. */
export type ProposalProject = { slug: string; name: string };

/** The reader's own contribution branch for a proposal, and whether it lags the proposal. */
export type MyContribution = { branch: string; behind: boolean };

/** What a list shows about one proposal; the detail adds the changes and the reader's own branch. */
export type ProposalSummary = {
  id: string;
  name: string;
  status: DerivedStatus;
  createdByName: string;
  createdAt: string;
  /** The latest of creation, a contribution and the outcome. */
  lastMovementAt: string;
  projects: ProposalProject[];
  tip: string | null;
  contributors: string[];
  may: ProposalPermissions;
};

/** What one reader receives about one proposal. */
export type ProposalView = ProposalSummary & {
  behindPublished: number;
  changes: ProposalChange[];
  mine: MyContribution | null;
};

/** Reasons a promotion would be refused; a closed list so each has plain wording in the interface. */
export const PROMOTION_REASONS = ['authority', 'stale-tip', 'not-descendant', 'invalid', 'guard', 'limit', 'missing-project', 'not-open'] as const;
/** One reason a promotion would be refused. */
export type PromotionReason = (typeof PROMOTION_REASONS)[number];

/** The answer to "would promoting this proposal work now". */
export type PromotionCheck = { ok: boolean; reasons: PromotionReason[]; files: string[] };

/** The kinds of proposal event sent to open browsers. */
export type ProposalEventKind = 'created' | 'contributed' | 'promoted' | 'closed' | 'restored';
