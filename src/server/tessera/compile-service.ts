// The three read operations of compile: check what a compile would do, run it on the published snapshot, and build the bundle for download. None of them writes anything.
import { canonicalJson } from '../../shared/tessera/canonical-json';
import { compileFindings, type CompileFinding } from '../../shared/tessera/compile-findings';
import { compileUnit, type CompileResult, type UnitFile } from '../../shared/tessera/compile-unit';
import { sha256Hex } from '../../shared/tessera/digest';
import type { Acceptance, LossPolicy, LossReport } from '../../shared/tessera/loss-report';
import { buildManifest, type Manifest, type ManifestSource } from '../../shared/tessera/manifest';
import { NotFoundError } from '../projects/errors';
import { decideAcceptance } from './accept-loss';
import { bundleFiles } from './bundle-files';
import { readOutputPart, type OutputPart } from './output-part';
import type { SourceLabel, UnitRead, UnitSource } from './unit-source';

/** Says where an answer's files came from, as the HTTP contract names it. */
export type SourceDescription = { kind: 'published-snapshot'; commit: string } | { kind: 'working-copy'; unpublished: true };

/** What a person offers to accept a loss: the digest of the report they saw, or a policy. */
export type AcceptanceRequest = { digest: string } | { lossPolicy: LossPolicy };

/** The published commit moved after the person saw a report, so nothing may be mixed across the two. */
export class SnapshotChangedError extends Error {
  constructor(readonly current: string) {
    super('The published snapshot changed.');
    this.name = 'SnapshotChangedError';
  }
}

/** The answer of a check. It never holds compiled bytes. */
export type CheckAnswer = {
  result: 'ok' | 'loss' | 'refused';
  source: SourceDescription;
  base: LossReport['base'];
  findings: CompileFinding[];
  report: LossReport;
  files: { path: string; treatment: string; sha256: string }[];
  accepted: boolean;
};

/** A compile of the published snapshot, in the three ways it can end. */
export type CompileOutcome =
  | { result: 'refused'; source: SourceDescription; findings: CompileFinding[] }
  | { result: 'loss-needs-acceptance'; source: SourceDescription; report: LossReport; reason: string }
  | { result: 'released'; source: SourceDescription; report: LossReport; manifest: Manifest; bundle: UnitFile[]; commit: string };

/** The answer of a run: the outcome without the bytes of the bundle, and one part of one file when asked for. */
export type RunAnswer =
  | { result: 'refused'; source: SourceDescription; findings: CompileFinding[] }
  | { result: 'loss-needs-acceptance'; source: SourceDescription; report: LossReport }
  | { result: 'released'; source: SourceDescription; manifest: Manifest; report: LossReport; files: { path: string; sha256: string; bytes: number }[]; part?: OutputPart };

/** What a run or a bundle request names. */
export type CompileRequest = { accept?: AcceptanceRequest; commit?: string };

/** What a run asks of one file of the bundle. */
export type FileRequest = { path: string; offset: number };

/** Policies are identified in the report by the hash of their canonical text, so the same policy always gives the same report. */
function policyHash(policy: LossPolicy): string {
  return sha256Hex(canonicalJson(policy));
}

function describeSource(label: SourceLabel): SourceDescription {
  if (label.kind === 'published-snapshot') return { kind: 'published-snapshot', commit: label.commit };
  return { kind: 'working-copy', unpublished: true };
}

function manifestSourceOf(read: UnitRead): ManifestSource {
  const { branch, commit, projectFolder } = read.place!;
  return { kind: 'published-snapshot', branch, commit, projectFolder };
}

function compileRead(read: UnitRead, lossPolicySha256: string | null): CompileResult {
  return compileUnit(read.files, { lossPolicySha256, providers: read.mesh?.providers, project: read.project });
}

function resultOfCheck(compile: CompileResult): CheckAnswer['result'] {
  if (compile.failures.length) return 'refused';
  return compile.report.losses.length ? 'loss' : 'ok';
}

/** Checks a unit read from either source. The answer carries findings and the report, never compiled bytes. */
export async function checkUnit(units: UnitSource, request: { source: 'published' | 'working'; lossPolicy?: LossPolicy }): Promise<CheckAnswer> {
  const read = await units.read(request.source);
  const compile = compileRead(read, null);
  const decision = decideAcceptance(compile.report, compile.failures, request.lossPolicy ? { policy: request.lossPolicy } : {});
  return {
    result: resultOfCheck(compile),
    source: describeSource(read.label),
    base: compile.report.base,
    findings: compileFindings(compile),
    report: compile.report,
    files: compile.report.inputs.map(input => ({ path: input.path, treatment: input.treatment, sha256: input.sha256 })),
    accepted: decision.decision === 'accepted',
  };
}

function acceptanceOffer(accept: AcceptanceRequest | undefined) {
  if (!accept) return {};
  return 'digest' in accept ? { digest: accept.digest } : { policy: accept.lossPolicy };
}

function acceptedWith(accept: AcceptanceRequest | undefined, accepted: Acceptance): Acceptance {
  return accept ? accepted : 'none';
}

/** Compiles the published snapshot. The commit it read is pinned for the whole compile, whatever is published meanwhile. */
export async function compilePublished(units: UnitSource, request: CompileRequest): Promise<CompileOutcome> {
  const read = await units.read('published');
  if (request.commit !== undefined && request.commit !== read.commit) throw new SnapshotChangedError(read.commit!);
  const policy = request.accept && 'lossPolicy' in request.accept ? request.accept.lossPolicy : undefined;
  const compile = compileRead(read, policy ? policyHash(policy) : null);
  const source = describeSource(read.label);
  const decision = decideAcceptance(compile.report, compile.failures, acceptanceOffer(request.accept));
  if (decision.decision === 'refused') return { result: 'refused', source, findings: compileFindings(compile) };
  if (decision.decision === 'needs-acceptance') return { result: 'loss-needs-acceptance', source, report: compile.report, reason: decision.reason };
  const accepted = acceptedWith(request.accept, decision.accepted);
  const manifest = buildManifest(compile, manifestSourceOf(read), accepted);
  return { result: 'released', source, report: compile.report, manifest, bundle: bundleFiles(compile, manifestSourceOf(read), accepted), commit: read.commit! };
}

function partOf(outcome: Extract<CompileOutcome, { result: 'released' }>, file: FileRequest, commit: string | undefined): OutputPart {
  const found = outcome.bundle.find(candidate => candidate.path === file.path);
  if (!found) throw new NotFoundError('Not found.');
  return readOutputPart({ commit: outcome.commit, path: found.path, version: sha256Hex(found.bytes), bytes: found.bytes }, { commit, offset: file.offset });
}

/** Runs a compile and answers with the report and, when released, the file list and optionally one part of one file. */
export async function runCompile(units: UnitSource, request: CompileRequest, file?: FileRequest): Promise<RunAnswer> {
  const outcome = await compilePublished(units, request);
  if (outcome.result === 'refused') return outcome;
  if (outcome.result === 'loss-needs-acceptance') return { result: outcome.result, source: outcome.source, report: outcome.report };
  const files = outcome.bundle.map(entry => ({ path: entry.path, sha256: sha256Hex(entry.bytes), bytes: entry.bytes.length }));
  const answer: RunAnswer = { result: 'released', source: outcome.source, manifest: outcome.manifest, report: outcome.report, files };
  if (file) answer.part = partOf(outcome, file, request.commit);
  return answer;
}
