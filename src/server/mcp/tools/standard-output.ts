// The two tools that turn a Tessera unit into standard Ossie: one checks, one compiles. Both are twins of the compile routes, read only, and never accept a loss on their own.
import type { CompileFinding } from '../../../shared/tessera/compile-findings';
import type { LossReport } from '../../../shared/tessera/loss-report';
import type { CheckAnswer, RunAnswer } from '../../tessera/compile-service';
import { DEFAULT_TOOL_REQUEST_CAP_BYTES } from '../body-limits';
import type { ToolDefinition } from '../tool-definition';
import { PAGE_ARGUMENTS, pageBinding, pageOf } from '../tool-paging';
import { fail, findingsOf, MAXIMUM_FINDINGS, succeed, type ToolResult } from '../tool-results';
import type { TwinAnswer } from '../twin-dispatch';
import { PATH, PROJECT, READ_HINTS } from './tool-arguments';

const DIGEST = { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' } as const;
const COMMIT = { type: 'string', pattern: '^(?:[0-9a-f]{40}|[0-9a-f]{64})$' } as const;

/** The route answers 409 with this error when the published commit moved after the caller read it. */
const SNAPSHOT_CHANGED = 'snapshot-changed';

/** Findings as the other tools report them, with the document each one belongs to. */
function compileFindingsOf(findings: CompileFinding[]) {
  const reported = findingsOf(findings, MAXIMUM_FINDINGS);
  return reported.map((finding, index) => ({ document: findings[index].document, ...finding }));
}

/** The parts of a loss report that are always small: what was lost per property, and the digest that accepts it. */
function reportSummary(report: LossReport) {
  return { counts: report.counts, digest: report.digest, lossCount: report.losses.length, ...(report.statusCounts ? { statusCounts: report.statusCounts } : {}) };
}

/** A moved published commit is the tool's own `version_changed`, so the caller knows to start again from the report. */
function changedSnapshot(answer: TwinAnswer | undefined): ToolResult | null {
  const body = answer?.body as { error?: unknown; current?: unknown } | undefined;
  if (answer?.status !== 409 || body?.error !== SNAPSHOT_CHANGED) return null;
  return fail(
    'version_changed',
    'The published snapshot changed since the report was read. Compile again without a commit and accept the new digest.',
    typeof body.current === 'string' ? { currentCommit: body.current } : {},
  );
}

const checkStandard: ToolDefinition = {
  name: 'check_standard',
  description:
    'Check whether a project compiles to standard Ossie and list what the compile would drop. Reads the published snapshot by default; source "working" reads your unpublished working copy and says so. Returns findings and the loss report, never compiled files. Page the lost entries with the cursor.',
  inputSchema: {
    type: 'object',
    properties: { project: PROJECT, source: { type: 'string', enum: ['published', 'working'] }, lossPolicy: { type: 'object' }, ...PAGE_ARGUMENTS },
    required: ['project'],
    additionalProperties: false,
  },
  hints: READ_HINTS,
  operation: 'compile.check',
  retryClass: 'repeatable',
  requestCapBytes: DEFAULT_TOOL_REQUEST_CAP_BYTES,
  async run(args, context) {
    const body = { source: args.source ?? 'published', ...(args.lossPolicy !== undefined ? { lossPolicy: args.lossPolicy } : {}) };
    const called = await context.twin('compile.check', { params: { slug: args.project }, body });
    if (!called.ok) return called.failure;
    const answer = called.answer.body as CheckAnswer;
    const binding = pageBinding('check_standard', { project: args.project, ...body }, 'losses', answer.report.losses, context);
    const losses = pageOf(answer.report.losses, args, context, binding);
    if (!losses.ok) return losses.failure;
    return succeed({
      result: answer.result,
      source: answer.source,
      base: answer.base,
      accepted: answer.accepted,
      findings: compileFindingsOf(answer.findings),
      findingCount: answer.findings.length,
      report: { ...reportSummary(answer.report), losses: losses.page.items, ...(losses.page.nextCursor ? { nextCursor: losses.page.nextCursor } : {}) },
      files: answer.files,
    });
  },
};

/** The route body: the digest only when the caller sent one, and a file part only together with its commit. */
function compileBody(args: { acceptDigest?: string; commit?: string; path?: string; offset?: number }) {
  return {
    ...(args.acceptDigest !== undefined ? { accept: { digest: args.acceptDigest } } : {}),
    ...(args.commit !== undefined ? { commit: args.commit } : {}),
    ...(args.path !== undefined ? { file: { path: args.path, offset: args.offset ?? 0 } } : {}),
  };
}

/** Shapes the three ends of a compile: refused, a loss to accept, or released with its manifest or one part. */
function compileResult(answer: RunAnswer): ToolResult {
  if (answer.result === 'refused') return succeed({ result: answer.result, source: answer.source, findings: compileFindingsOf(answer.findings), findingCount: answer.findings.length });
  if (answer.result === 'loss-needs-acceptance') return succeed({ result: answer.result, source: answer.source, report: reportSummary(answer.report), digest: answer.report.digest });
  if (answer.part) return succeed({ part: answer.part });
  return succeed({ result: answer.result, source: answer.source, manifest: answer.manifest, files: answer.files });
}

const compileStandard: ToolDefinition = {
  name: 'compile_standard',
  description:
    'Compile the published snapshot of a project to standard Ossie. Without acceptDigest a compile that drops anything answers loss-needs-acceptance with the report and its digest; send that digest back to accept exactly that loss. A released compile lists the manifest and files; read a file in parts with path, offset and the commit named in source. Never returns unpublished content and writes nothing.',
  inputSchema: {
    type: 'object',
    properties: { project: PROJECT, acceptDigest: DIGEST, commit: COMMIT, path: PATH, offset: { type: 'integer', minimum: 0 } },
    required: ['project'],
    dependencies: { path: ['commit'], offset: ['path'] },
    additionalProperties: false,
  },
  hints: READ_HINTS,
  operation: 'compile.run',
  retryClass: 'repeatable',
  requestCapBytes: DEFAULT_TOOL_REQUEST_CAP_BYTES,
  async run(args, context) {
    const called = await context.twin('compile.run', { params: { slug: args.project }, body: compileBody(args) });
    if (!called.ok) return changedSnapshot(called.answer) ?? called.failure;
    return compileResult(called.answer.body as RunAnswer);
  },
};

export const standardOutputTools: ToolDefinition[] = [checkStandard, compileStandard];
