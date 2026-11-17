// Runs tools for any test identity through the same boundary the endpoint uses, without the transport, so authorization can be checked for every role.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mintCaller } from '../../../src/server/auth/caller';
import type { Principal } from '../../../src/server/auth/principal';
import type { createHandler } from '../../../src/server/handler';
import { createCursorCodec } from '../../../src/server/mcp/cursors';
import { createReceiptStore } from '../../../src/server/mcp/receipts';
import { checkToolInput } from '../../../src/server/mcp/tool-definition';
import { TOOLS } from '../../../src/server/mcp/tool-registry';
import { fail, type ToolResult } from '../../../src/server/mcp/tool-results';
import { createTwinCall } from '../../../src/server/mcp/twin-dispatch';

/** A runner of tools for one principal against one handler. */
export function toolRunner(handler: ReturnType<typeof createHandler>, principal: Principal) {
  const caller = mintCaller({ principal, origin: 'mcp', connection: 'local' });
  const receipts = createReceiptStore(join(mkdtempSync(join(tmpdir(), 'receipts-')), 'mcp-receipts'));
  const cursors = createCursorCodec();
  return {
    caller,
    listed: () => new Set(handler.boundary.availableOperations(caller)),
    async run(name: string, args: Record<string, unknown>): Promise<ToolResult> {
      const tool = TOOLS.find(candidate => candidate.name === name);
      if (!tool) return fail('not_found', 'No such tool.');
      const invalid = checkToolInput(tool, args);
      if (invalid) return invalid;
      return tool.run(args, { twin: createTwinCall(handler.boundary, caller), cursors, receipts, principalId: principal.id, signal: new AbortController().signal });
    },
  };
}
