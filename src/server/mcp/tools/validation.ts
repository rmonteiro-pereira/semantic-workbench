// The tool that checks proposed text with the save pipeline's own rules and writes nothing.
import { GLOBAL_REQUEST_CAP_BYTES } from '../body-limits';
import type { ToolDefinition } from '../tool-definition';
import { succeed } from '../tool-results';
import { EDIT_ARGUMENTS, PATCHES } from './editing-arguments';

/** The most findings one validation answer lists; the count says how many there were. */
const MAXIMUM_FINDINGS = 200;

type Finding = { path: string; severity: string; message: string; line?: number; column?: number };

const validateText: ToolDefinition = {
  name: 'validate_text',
  description:
    'Check proposed text for a file exactly as saving would, without saving. Send the full source, or patches with the version they were made against. Browser-only checks such as SHACL are not covered.',
  inputSchema: {
    type: 'object',
    properties: { ...EDIT_ARGUMENTS, source: { type: 'string', maxLength: 2_000_000 }, patches: PATCHES, baseVersion: { type: 'string', pattern: '^[0-9a-f]{64}$' } },
    required: ['project', 'path'],
    additionalProperties: false,
  },
  hints: { readOnly: true, destructive: false, idempotent: true, openWorld: false },
  operation: 'files.validate',
  retryClass: 'repeatable',
  requestCapBytes: GLOBAL_REQUEST_CAP_BYTES,
  async run(args, context) {
    const body = {
      ...(args.source !== undefined ? { source: args.source } : {}),
      ...(args.patches !== undefined ? { patches: args.patches } : {}),
      ...(args.baseVersion !== undefined ? { baseHash: args.baseVersion } : {}),
    };
    const called = await context.twin('files.validate', { params: { slug: args.project, '*': args.path }, body });
    if (!called.ok) return called.failure;
    const answer = called.answer.body as { valid: boolean; version: string | null; findings: Finding[]; guard: Record<string, unknown> };
    const findings = answer.findings
      .slice(0, MAXIMUM_FINDINGS)
      .map(finding => ({ pointer: finding.path, severity: finding.severity, message: finding.message, ...(finding.line !== undefined ? { line: finding.line } : {}) }));
    return succeed({ valid: answer.valid, findings, findingCount: answer.findings.length, guard: answer.guard });
  },
};

export const validationTools: ToolDefinition[] = [validateText];
