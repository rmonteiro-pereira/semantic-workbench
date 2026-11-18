// The loss report: what a compile dropped, listed by item, with counts and a digest that acceptance is bound to.
import { canonicalJson, compareText } from './canonical-json';
import { sha256Hex } from './digest';

/** One value the compiler removed. The value itself is never stored, only its size and hash. */
export type LossEntry = {
  document: string;
  item: string;
  property: string;
  pointer: string;
  bytes: number;
  sha256: string;
};

/** What the compiler did with an input file. */
export type Treatment = 'compiled' | 'copied' | 'not-included';

/** An input file as the report records it. */
export type ReportInput = { path: string; sha256: string; treatment: Treatment };

/** An output file as the report records it. */
export type ReportOutput = { path: string; sha256: string };

/** What goes into a report besides the losses. */
export type ReportSubject = {
  compiler: { name: string; version: string };
  base: { version: string; label: string };
  /** The SHA-256 of the loss policy file given to the compile, or nothing. */
  lossPolicySha256: string | null;
  inputs: ReportInput[];
  outputs: ReportOutput[];
  losses: LossEntry[];
};

/** The report. It holds no value, no time and no machine path, so equal input gives equal bytes. */
export type LossReport = {
  reportVersion: 1;
  compiler: ReportSubject['compiler'];
  base: ReportSubject['base'];
  options: { lossPolicy: string | null };
  inputs: ReportInput[];
  outputs: ReportOutput[];
  losses: LossEntry[];
  counts: Record<string, number>;
  digest: string;
};

function byPath<T extends { path: string }>(items: T[]): T[] {
  return [...items].sort((first, second) => compareText(first.path, second.path));
}

function byDocumentThenPointer(losses: LossEntry[]): LossEntry[] {
  return [...losses].sort((first, second) => compareText(first.document, second.document) || compareText(first.pointer, second.pointer));
}

function countByProperty(losses: LossEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const loss of losses) counts[loss.property] = (counts[loss.property] ?? 0) + 1;
  return counts;
}

/** Prints a report the way it is stored: sorted keys, two spaces, LF. */
export function printReport(report: LossReport): string {
  return canonicalJson(report);
}

/** The digest of a report: the SHA-256 of its canonical JSON without the digest field. */
export function digestOf(report: Omit<LossReport, 'digest'>): string {
  return `sha256:${sha256Hex(canonicalJson(report))}`;
}

/** Builds the report with sorted lists, counts per property and its digest. */
export function buildLossReport(subject: ReportSubject): LossReport {
  const body: Omit<LossReport, 'digest'> = {
    reportVersion: 1,
    compiler: subject.compiler,
    base: subject.base,
    options: { lossPolicy: subject.lossPolicySha256 },
    inputs: byPath(subject.inputs),
    outputs: byPath(subject.outputs),
    losses: byDocumentThenPointer(subject.losses),
    counts: countByProperty(subject.losses),
  };
  return { ...body, digest: digestOf(body) };
}
