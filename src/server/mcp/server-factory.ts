// Builds the protocol server for one request from the tool registry. Tools are plain data: this module wraps each with input checking, the rate and deadline limits, the result cap and the audit of calls that fail before any twin runs.
import { McpServer, fromJsonSchema, type CallToolResult, type StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import type { Caller } from '../auth/caller';
import type { OperationBoundary } from '../auth/operation-boundary';
import type { CallAudit, CallAttribution } from './call-audit';
import { withDeadline, type CallLimits } from './call-limits';
import type { CursorCodec } from './cursors';
import type { ReceiptStore } from './receipts';
import { checkToolInput, type ToolDefinition } from './tool-definition';
import { fail, RESULT_CAP_BYTES, toCallToolResult, type ToolResult } from './tool-results';
import { createTwinCall, type TwinCall } from './twin-dispatch';

/** Everything a protocol server needs for one request. Each part is passed in so tests can replace it. */
export type ToolServerDependencies = {
  tools: ToolDefinition[];
  /** Operation ids the caller may use; tools whose twin is absent are left out of the list. Null lists every tool. */
  visibleOperations: Set<string> | null;
  boundary: OperationBoundary;
  caller: Caller;
  cursors: CursorCodec;
  receipts: ReceiptStore;
  limits: CallLimits;
  audit: CallAudit;
  attribution: CallAttribution;
  /** Closed when the client goes away, which stops reads and lets a started write finish. */
  signal: AbortSignal;
};

/**
 * The input schema as the library wants it: the real schema for listing, and a validator that
 * accepts everything, because this module checks arguments itself to answer with the tool
 * contract's own error shape.
 */
function listedSchema(tool: ToolDefinition): StandardSchemaWithJSON<Record<string, unknown>, Record<string, unknown>> {
  const real = fromJsonSchema(tool.inputSchema as never, new AjvJsonSchemaValidator()) as unknown as { '~standard': Record<string, unknown> };
  return { '~standard': { ...real['~standard'], validate: (value: unknown) => ({ value }) } } as unknown as StandardSchemaWithJSON<Record<string, unknown>, Record<string, unknown>>;
}

/** Keeps a result inside the cap, so a page that grew too large is an explicit refusal instead of a silent cut. */
function withinCap(result: ToolResult): ToolResult {
  if (Buffer.byteLength(JSON.stringify(result)) <= RESULT_CAP_BYTES * 2) return result;
  return fail('limit_exceeded', 'The result is larger than one answer may be. Ask for a smaller page or range.', { limit: 'result' });
}

/** Counts twin calls and remembers the failure codes twins answered, which the operation boundary has already recorded. */
function countingTwin(call: TwinCall): { twin: TwinCall; dispatched: () => number; reported: Set<string> } {
  let count = 0;
  const reported = new Set<string>();
  return {
    twin: async (operationId, input) => {
      count++;
      const called = await call(operationId, input);
      if (!called.ok && !called.failure.ok) reported.add(called.failure.error.code);
      return called;
    },
    dispatched: () => count,
    reported,
  };
}

async function runTool(tool: ToolDefinition, args: unknown, dependencies: ToolServerDependencies): Promise<ToolResult> {
  const { limits, audit, attribution } = dependencies;
  const admission = limits.admit();
  if (!admission.ok) {
    const result = fail('rate_limited', 'Too many calls at once or too fast. Wait and try again.', { retryAfterSeconds: admission.retryAfterSeconds });
    audit.undispatched(attribution, tool.operation, 'rate_limited');
    return result;
  }
  try {
    const invalid = checkToolInput(tool, args);
    if (invalid) {
      audit.undispatched(attribution, tool.operation, 'invalid_input');
      return invalid;
    }
    const counted = countingTwin(createTwinCall(dependencies.boundary, dependencies.caller, dependencies.signal));
    const outcome = await withDeadline(limits.settings.deadlineMs, signal => {
      const signals = AbortSignal.any([dependencies.signal, signal]);
      const twin: TwinCall = (operationId, input) => counted.twin(operationId, { ...input, signal: signals });
      return tool.run(args, { twin, cursors: dependencies.cursors, receipts: dependencies.receipts, principalId: dependencies.caller.principal.id, signal: signals });
    });
    const result = outcome.finished ? withinCap(outcome.value) : fail('limit_exceeded', 'The call took longer than the deadline.', { limit: 'deadline' });
    // A failure the tool decided itself, such as a changed version or an expired cursor, was not seen by any twin, so it is recorded here with the code the caller was told.
    if (!result.ok && (counted.dispatched() === 0 || !counted.reported.has(result.error.code))) audit.undispatched(attribution, tool.operation, result.error.code);
    return result;
  } finally {
    admission.permit.release();
  }
}

/** Creates a protocol server whose tools are the visible part of the registry. */
export function buildToolServer(dependencies: ToolServerDependencies): McpServer {
  const server = new McpServer({ name: 'semantic-workbench', version: '1.0.0' }, { capabilities: { tools: { listChanged: false } } });
  const visible = dependencies.visibleOperations;
  for (const tool of dependencies.tools) {
    if (visible && !visible.has(tool.operation)) continue;
    const annotations = { readOnlyHint: tool.hints.readOnly, destructiveHint: tool.hints.destructive, idempotentHint: tool.hints.idempotent, openWorldHint: tool.hints.openWorld };
    server.registerTool(tool.name, { description: tool.description, inputSchema: listedSchema(tool), annotations }, async (args: Record<string, unknown>): Promise<CallToolResult> =>
      toCallToolResult(await runTool(tool, args, dependencies)),
    );
  }
  return server;
}
