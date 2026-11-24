// What a protocol call is recorded with: the closed lists of methods and result codes, and the length of a client's own label. The audit log, the endpoint and the tools all read these lists, so a code or method is added in one place.

/** Failure codes a tool may answer with. A client can branch on these without parsing the message. */
export const TOOL_ERROR_CODES = [
  'invalid_input',
  'not_found',
  'refused',
  'conflict',
  'guard_refused',
  'precondition_failed',
  'key_reused',
  'uncertain',
  'not_published',
  'not_ready',
  'unavailable',
  'version_changed',
  'cursor_expired',
  'limit_exceeded',
  'rate_limited',
  'internal',
] as const;
/** One failure code of a tool result. */
export type ToolErrorCode = (typeof TOOL_ERROR_CODES)[number];

/** Results a record may carry: `ok` and the failure codes of the tool contract. */
export const AUDIT_RESULTS: readonly string[] = ['ok', ...TOOL_ERROR_CODES];

/** Protocol methods a record may name. */
export const ATTRIBUTED_METHODS: readonly string[] = [
  'server/discover',
  'tools/list',
  'tools/call',
  'initialize',
  'ping',
  'resources/list',
  'prompts/list',
  'subscriptions/listen',
  'notifications/initialized',
  'notifications/cancelled',
  'unknown',
];

/** The most characters a client's label keeps. */
export const MAXIMUM_CLIENT_LABEL_LENGTH = 64;
