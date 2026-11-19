// Faults in the agent endpoint, each paired with an assertion in scripts/mcp-mutation-cases.ts. Every one must make the mutation run fail.
/** Deliberate faults: category, file, the text to replace and its replacement. */
export const mcpMutants: [string, string, string, string][] = [
  // Access.
  ['mcp-gate', 'src/server/mcp/request-gate.ts', "if (!own.capabilityMatches(bearerValue(request.authorization))) return { allow: false, status: 401, reason: 'capability' };", ''],
  ['mcp-gate', 'src/server/mcp/request-gate.ts', "if (request.origin !== null) return { allow: false, status: 403, reason: 'origin' };", ''],
  ['mcp-gate', 'src/server/mcp/request-gate.ts', '!ownHostNames(own.port).includes(request.host.toLowerCase())', "!request.host.includes('127.0.0.1')"],
  ['mcp-gate', 'src/server/mcp/request-gate.ts', "if (request.method !== 'POST') return { allow: false, status: 405, reason: 'method' };", ''],
  // Reads.
  ['mcp-tools', 'src/server/mcp/tools/projects-and-files.ts', "operation: 'trash.list',", "operation: 'projects.list',"],
  ['mcp-state', 'src/server/mcp/cursors.ts', 'claim.principal === binding.principal', 'true'],
  ['mcp-state', 'src/server/mcp/cursors.ts', 'claim.generation === binding.generation', 'true'],
  ['mcp-state', 'src/server/mcp/tool-results.ts', 'Math.min(requestedLength, RESULT_CAP_BYTES)', 'requestedLength'],
  ['mcp-tools', 'src/server/mcp/tools/published-context.ts', "operation: 'agent.catalog.read',", "operation: 'preview.catalog',"],
  ['mcp-tools', 'src/server/mcp/twin-dispatch.ts', 'return fail(code, NOT_AVAILABLE);', 'return fail(code, message);'],
  // Writes.
  ['mcp-tools', 'src/server/mcp/tools/editing.ts', 'run: (args, context) => store(context, args, args.baseVersion),', 'run: (args, context) => store(context, args, null),'],
  ['mcp-state', 'src/server/mcp/receipts.ts', "if (existing?.state === 'done' && existing.result) return existing.result;", ''],
  ['mcp-state', 'src/server/mcp/receipts.ts', 'existing && existing.argumentsHash !== hash', 'false'],
  ['mcp-state', 'src/server/mcp/receipts.ts', 'const { idempotencyKey: _key, ...rest } = args;', 'const rest = {};'],
  ['mcp-tools', 'src/server/mcp/tools/editing.ts', 'const differs = answer.source !== undefined;', 'const differs = false;'],
  // Commit.
  [
    'mcp-tools',
    'src/server/mcp/tools/source-control.ts',
    'const body = { message: args.message, files: args.files, expectedBranch: args.expectedBranch, expectedHead: args.expectedHead };',
    'const body = { message: args.message, files: args.files, expectedBranch: args.expectedBranch, expectedHead: args.expectedHead, push: true };',
  ],
  ['mcp-tools', 'src/server/mcp/tools/source-control.ts', '...(committed.altered?.length ? { altered: committed.altered } : {}),', ''],
  ['mcp-tools', 'src/server/mcp/tools/source-control.ts', 'expectedHead: args.expectedHead };', 'expectedHead: undefined };'],
  ['mcp-tools', 'src/server/mcp/tools/source-control.ts', 'files: args.files, expectedBranch', 'files: [], expectedBranch'],
  // Audit.
  ['mcp-audit', 'src/server/auth/audit.ts', "'version', 'tool', 'connection', 'method', 'clientLabel', 'result', 'disclosureShown']", "'version', 'tool', 'connection', 'disclosureShown']"],
  ['mcp-rows', 'src/server/auth/route-actions.ts', "methods: ['POST', 'GET', 'DELETE', 'PUT', 'PATCH'], unaudited: true }", "methods: ['POST', 'GET', 'DELETE', 'PUT', 'PATCH'] }"],
];
