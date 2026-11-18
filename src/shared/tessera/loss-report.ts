// The loss report: what a compile dropped, listed by item, with counts and a digest that acceptance is bound to.
import { canonicalJson, compareText } from './canonical-json';
import { sha256Hex } from './digest';
import type { Registry } from './registry';

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

/** A versioned file that lists the property names whose loss is accepted. */
export type LossPolicy = { policy: 1; allow: string[] };

/** The way a loss was accepted: there was none, the digest matched, or a policy allowed every lost property. */
export type Acceptance = 'none' | 'digest' | 'policy';

/** Says the policy file is not usable. The message names what to fix. */
export class LossPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LossPolicyError';
  }
}

/** Reads a loss policy: version 1, a list of registered property names, and no other key. */
export function parseLossPolicy(text: string, registry: Registry): LossPolicy {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new LossPolicyError('The loss policy is not valid JSON.');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new LossPolicyError('The loss policy must be a JSON object.');
  const entries = value as Record<string, unknown>;
  const unknownKey = Object.keys(entries).find(key => key !== 'policy' && key !== 'allow');
  if (unknownKey) throw new LossPolicyError(`The loss policy has an unknown key: ${unknownKey}.`);
  if (entries.policy !== 1) throw new LossPolicyError('The loss policy must say "policy": 1.');
  const allow = entries.allow;
  if (!Array.isArray(allow) || allow.some(name => typeof name !== 'string')) throw new LossPolicyError('The loss policy needs "allow", a list of property names.');
  const unregistered = (allow as string[]).find(name => !registry.byName(name));
  if (unregistered) throw new LossPolicyError(`The loss policy allows ${unregistered}, which is not a registered property.`);
  return { policy: 1, allow: [...(allow as string[])] };
}

/** What the person supplied to accept a loss. */
export type AcceptanceOffer = { digest?: string; policy?: LossPolicy };

/** The outcome of offering acceptance: how it was accepted, or why it was not. */
export type AcceptanceResult = { accepted: Acceptance } | { refusal: string };

/** Decides whether a report's loss is accepted. A failure of the compile itself never reaches this function. */
export function acceptLoss(report: LossReport, offer: AcceptanceOffer): AcceptanceResult {
  if (!report.losses.length) return { accepted: 'none' };
  if (offer.digest !== undefined && offer.digest === report.digest) return { accepted: 'digest' };
  const outside = offer.policy ? [...new Set(report.losses.map(loss => loss.property))].filter(property => !offer.policy!.allow.includes(property)) : [];
  if (offer.policy && !outside.length) return { accepted: 'policy' };
  const reasons: string[] = [];
  if (offer.digest !== undefined) reasons.push(`The digest ${offer.digest} does not match the report's digest ${report.digest}.`);
  if (offer.policy) reasons.push(`The loss policy does not allow ${outside.join(', ')}.`);
  if (!reasons.length) reasons.push('The compile drops values and the loss is not accepted. Supply the report digest or a loss policy.');
  return { refusal: reasons.join(' ') };
}
