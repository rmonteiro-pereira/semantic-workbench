// Faults that exercise the guarantees preserved by the shared operation entry point.
/** Deliberate boundary faults paired with the focused operation assertions. */
export const operationBoundaryMutants: [string, string, string, string][] = [
  ['operation-boundary', 'src/server/auth/operation-boundary.ts', "mode === 'server' && (scope.principal.deactivated || withoutGrants)", 'false'],
  ['operation-boundary', 'src/server/auth/operation-boundary.ts', "const trash = mode === 'server' ? trashLookup(ws, request) : undefined;", 'const trash = undefined;'],
  ['operation-boundary', 'src/server/auth/operation-boundary.ts', "caller.principal.kind === 'client' ? clientRow(found.row) : found.row", 'found.row'],
  ['operation-boundary', 'src/server/auth/operation-boundary.ts', 'if (projects?.size) decision', 'if (false) decision'],
  ['operation-boundary', 'src/server/auth/operation-boundary.ts', "decision.allow && mode === 'server' && row.action === 'setIdentity'", 'false'],
  ['operation-boundary', 'src/server/auth/operation-boundary.ts', "(row.targets !== 'body' && !client)", 'true'],
  ['operation-boundary', 'src/server/auth/operation-boundary.ts', 'if (!(error instanceof WriteAccessError)) throw error;', 'throw error;'],
  ['operation-boundary', 'src/server/auth/operation-boundary.ts', "mode === 'server' && hiddenResponses.has(response)", 'false'],
  ['operation-boundary', 'src/server/auth/operation-boundary.ts', "mode === 'server' && response.status === 404", 'false'],
  ['operation-boundary', 'src/server/auth/operation-boundary.ts', 'assertMinted(call.caller);', ''],
  ['operation-boundary', 'src/server/auth/operation-boundary.ts', 'call.operation !== undefined && call.operation !== entry?.id', 'false'],
  ['operation-boundary', 'src/server/auth/twin-request.ts', 'return encodeURIComponent(value);', 'return value;'],
  ['operation-boundary', 'src/server/auth/operation-boundary.ts', 'decision.allow && entry && !scopeAllows(caller.scope, entry.effects)', 'entry && !scopeAllows(caller.scope, entry.effects)'],
  ['operation-boundary', 'src/server/auth/connection-scope.ts', 'return scope === undefined || effects.every(effect => scope.includes(effect));', 'return true;'],
  [
    'operation-boundary',
    'src/server/auth/replay-sample.ts',
    "entry.origin !== undefined && entry.origin !== 'http' && entry.decision === 'allow' && READ_ACTIONS.includes(entry.action as (typeof READ_ACTIONS)[number])",
    'false',
  ],
  ['operation-boundary', 'src/server/auth/audit.ts', "'version', 'tool', 'method'", "'version', 'method'"],
];
