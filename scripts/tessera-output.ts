// Turns the outcome of a tessera command into text for people or one JSON object for programs, and into its exit status.
import type { CompileResult } from '../src/shared/tessera/compile-unit';
import type { Acceptance } from '../src/shared/tessera/loss-report';
import type { ManifestSource } from '../src/shared/tessera/manifest';
import { canonicalJson } from '../src/shared/tessera/canonical-json';

/** Exit statuses of the command. */
export const EXIT = { success: 0, refused: 1, needsAcceptance: 2, misuse: 64 } as const;

/** How a run ended. */
export type RunResult = 'compiled' | 'checked' | 'needs-acceptance' | 'refused';

/** Everything a run knows when it ends. */
export type RunOutcome = {
  result: RunResult;
  source: ManifestSource & { unpublished?: boolean };
  /** Absent when the run was refused before any file was compiled. */
  compile: CompileResult | null;
  accepted: Acceptance | null;
  /** Why the run was refused or needs acceptance, when the compile result does not say it. */
  message?: string;
  bundle: { folder: string; files: string[] } | null;
};

/** The finding of one document as the JSON output lists it. */
type OutputFinding = { document: string; severity: string; code: string; path: string; line?: number; column?: number; message: string };

/** Maps a result to the exit status the contract documents. */
export function exitStatusOf(result: RunResult): number {
  if (result === 'refused') return EXIT.refused;
  if (result === 'needs-acceptance') return EXIT.needsAcceptance;
  return EXIT.success;
}

/** Lists the findings of every document, then the failures that no document finding already says. */
export function findingsOf(outcome: RunOutcome): OutputFinding[] {
  const findings: OutputFinding[] = [];
  for (const entry of outcome.compile?.findings ?? []) {
    for (const issue of entry.issues)
      findings.push({ document: entry.document, severity: issue.severity, code: issue.code, path: issue.path, line: issue.line, column: issue.column, message: issue.message });
  }
  for (const failure of outcome.compile?.failures ?? []) {
    if (failure.code !== 'invalid-source') findings.push({ document: failure.document ?? '', severity: 'error', code: failure.code, path: '/', message: failure.message });
  }
  if (outcome.result === 'refused' && !outcome.compile && outcome.message) findings.push({ document: '', severity: 'error', code: 'refused', path: '/', message: outcome.message });
  return findings;
}

/** The one JSON object of `--json`. */
export function renderJson(outcome: RunOutcome): string {
  return canonicalJson({ result: outcome.result, source: outcome.source, findings: findingsOf(outcome), report: outcome.compile?.report ?? null, bundle: outcome.bundle });
}

function sourceLine(source: RunOutcome['source']): string {
  if (source.kind === 'files-on-disk') return 'Source: files on disk (unpublished)';
  const label = source.kind === 'published-snapshot' ? 'published snapshot' : 'snapshot';
  if (!source.commit) return `Source: ${label} (not read)`;
  return `Source: ${label} of ${source.branch} at ${source.commit}, folder ${source.projectFolder}`;
}

function findingLine(finding: OutputFinding): string {
  const place = finding.line ? `, line ${finding.line}, column ${finding.column ?? 1}` : '';
  const document = finding.document ? `${finding.document}: ` : '';
  return `  ${document}${finding.severity} ${finding.code} at ${finding.path}${place}: ${finding.message}`;
}

function lossLines(compile: CompileResult): string[] {
  const { report } = compile;
  if (!report.losses.length) return ['Loss: nothing is dropped.'];
  const counts = Object.entries(report.counts)
    .map(([property, count]) => `${property} ${count}`)
    .join(', ');
  return [`Loss: ${report.losses.length} values are dropped (${counts}).`, `Digest: ${report.digest}`];
}

function resultLine(outcome: RunOutcome): string {
  if (outcome.result === 'compiled') return `Result: compiled. The bundle is in ${outcome.bundle?.folder}.`;
  if (outcome.result === 'checked') return 'Result: checked. No error was found. Nothing was written.';
  if (outcome.result === 'needs-acceptance') return `Result: the loss needs acceptance, so nothing was written. ${outcome.message ?? ''}`.trim();
  return `Result: refused. ${outcome.message ?? 'Fix the findings above.'}`.trim();
}

/** The text a person reads: the source, the findings, the loss and the result, in that order. */
export function renderText(outcome: RunOutcome): string {
  const lines = [sourceLine(outcome.source)];
  const findings = findingsOf(outcome).filter(finding => finding.code !== 'refused');
  if (findings.length) lines.push('Findings:', ...findings.map(findingLine));
  if (outcome.compile) lines.push(...lossLines(outcome.compile));
  lines.push(resultLine(outcome));
  if (outcome.result === 'compiled' && outcome.accepted && outcome.accepted !== 'none') lines.push('Accepting a loss report is not approval of the exported content.');
  return lines.join('\n') + '\n';
}
