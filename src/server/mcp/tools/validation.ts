// The tool that checks proposed text with the save pipeline's own rules and writes nothing.
import { GLOBAL_REQUEST_CAP_BYTES } from '../body-limits';
import type { ToolDefinition } from '../tool-definition';
import { findingsOf, MAXIMUM_FINDINGS, succeed, type Finding } from '../tool-results';
import { EDIT_ARGUMENTS, PATCHES, READ_HINTS, VERSION } from './tool-arguments';

const validateText: ToolDefinition = {
  name: 'validate_text',
  description:
    'Check proposed text for a file exactly as saving would, without saving. Send the full source, or patches with the version they were made against. Tessera ontologies are accepted, and their findings carry the Tessera codes. Browser-only checks such as SHACL are not covered.',
  inputSchema: {
    type: 'object',
    properties: { ...EDIT_ARGUMENTS, source: { type: 'string', maxLength: 2_000_000 }, patches: PATCHES, baseVersion: VERSION },
    required: ['project', 'path'],
    additionalProperties: false,
  },
  hints: READ_HINTS,
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
    const findings = findingsOf(answer.findings, MAXIMUM_FINDINGS);
    return succeed({ valid: answer.valid, findings, findingCount: answer.findings.length, guard: answer.guard });
  },
};

export const validationTools: ToolDefinition[] = [validateText];
