// Shared label vocabulary keeps instrumentation independent of authorization modules.
/** Transport origins supported by operation calls and audit records. */
export const CALLER_ORIGINS = ['http', 'mcp', 'acp'] as const;
/** Transport that authenticated one operation's caller. */
export type CallerOrigin = (typeof CALLER_ORIGINS)[number];
/** Closed outcomes accepted by audit classification and operation metrics. */
export const OPERATION_OUTCOMES = ['ok', 'refused', 'failed', 'degraded'] as const;
/** Semantic result of an authorized operation. */
export type OperationOutcome = (typeof OPERATION_OUTCOMES)[number];
