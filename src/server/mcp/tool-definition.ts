// The shape of one tool: its plain JSON Schema, its four hints, the inventory operation it is the twin of, how a retry behaves and the function that runs it.
import Ajv from 'ajv';
import type { CursorCodec } from './cursors';
import { fail, type ToolResult } from './tool-results';
import type { TwinCall } from './twin-dispatch';
import type { ReceiptStore } from './receipts';

/** Plain JSON Schema for a tool's arguments. */
export type ToolSchema = Record<string, unknown>;

/** How a repeat of the same call behaves: nothing to guard, refused when the file changed, or answered from a stored receipt. */
export type RetryClass = 'repeatable' | 'precondition-protected' | 'receipt-backed';

/** The four protocol hints, each set on its own. The server never relies on them. */
export type ToolHints = { readOnly: boolean; destructive: boolean; idempotent: boolean; openWorld: boolean };

/** What a tool may use while it runs. Everything is passed in, so a test can replace any of it. */
export type ToolContext = {
  twin: TwinCall;
  cursors: CursorCodec;
  receipts: ReceiptStore;
  principalId: string;
  connectionId?: string;
  signal: AbortSignal;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: ToolSchema;
  hints: ToolHints;
  /** The inventory id of the route this tool is the twin of. */
  operation: string;
  retryClass: RetryClass;
  /** Largest request body for a call to this tool. */
  requestCapBytes: number;
  run: (args: any, context: ToolContext) => Promise<ToolResult>;
};

const ajv = new Ajv({ strict: true, strictRequired: false, allErrors: false });
const checks = new Map<string, ReturnType<typeof ajv.compile>>();

/** Checks arguments against the tool's schema and names the field that is wrong. */
export function checkToolInput(tool: ToolDefinition, args: unknown): ToolResult | null {
  let check = checks.get(tool.name);
  if (!check) {
    check = ajv.compile(tool.inputSchema);
    checks.set(tool.name, check);
  }
  if (check(args)) return null;
  const error = check.errors![0];
  const named = error.params.missingProperty ?? error.params.additionalProperty;
  const field = [error.instancePath.replace(/^\//, '').replaceAll('/', '.'), named].filter(Boolean).join('.');
  return fail('invalid_input', `The argument ${field ? `"${field}" ` : ''}${error.message ?? 'is not valid'}.`, { field });
}
