// Keeps the durable record of a repository's proposals: one JSON file per repository, replaced
// atomically. The proposal's tip is never stored here; it is the Git ref, so the two cannot drift.
import { join } from 'node:path';
import type { ProposalFile, ProposalRecord } from '../../shared/proposals/proposal';
import { atomicWriteJson, readJsonFile } from './atomic';
import type { DataLayout } from './paths';

/** Format version of the proposal file; an unknown one is refused instead of rewritten. */
const PROPOSAL_FORMAT = 1;

/** A proposal file that cannot be used: another format version or damaged content. */
export class ProposalStateError extends Error {}

function fileOf(layout: DataLayout, repository: string) {
  if (!repository || repository.startsWith('.') || /[\\/]/.test(repository)) throw new ProposalStateError('The repository folder name is not usable for proposals.');
  return join(layout.proposals, `${repository}.json`);
}

function parse(path: string, value: ProposalFile | null): ProposalFile {
  if (value === null) return { formatVersion: PROPOSAL_FORMAT, proposals: [] };
  const usable = value && typeof value === 'object' && value.formatVersion === PROPOSAL_FORMAT && Array.isArray(value.proposals);
  if (!usable) throw new ProposalStateError(`Unsupported proposal file format in ${path}.`);
  return value;
}

/** Reads and writes the proposal records of each repository. */
export function createProposalStore(layout: DataLayout) {
  return {
    /** Every record of the repository; empty when it has never had a proposal. */
    read(repository: string): ProposalRecord[] {
      const path = fileOf(layout, repository);
      return parse(path, readJsonFile<ProposalFile>(path)).proposals;
    },
    /** Replaces the repository's records; a stop mid-write leaves the old file whole. */
    write(repository: string, proposals: ProposalRecord[]) {
      atomicWriteJson(fileOf(layout, repository), { formatVersion: PROPOSAL_FORMAT, proposals });
    },
  };
}

/** The proposal records of every repository. */
export type ProposalStore = ReturnType<typeof createProposalStore>;
