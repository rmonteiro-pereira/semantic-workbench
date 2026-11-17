// Schema pieces the editing and validation tools share, so a patch is described once.
export const EDIT_ARGUMENTS = {
  project: { type: 'string', minLength: 1, maxLength: 200 },
  path: { type: 'string', minLength: 1, maxLength: 1024 },
} as const;

/** Patches in the save API's own form: ordered, non-overlapping UTF-16 ranges of the base text. */
export const PATCHES = {
  type: 'array',
  maxItems: 10_000,
  items: {
    type: 'object',
    properties: { from: { type: 'integer', minimum: 0 }, to: { type: 'integer', minimum: 0 }, insert: { type: 'string' } },
    required: ['from', 'to', 'insert'],
    additionalProperties: false,
  },
} as const;

/** A version hash, as read_file and list_files report it. */
export const VERSION = { type: 'string', pattern: '^[0-9a-f]{64}$' } as const;

/** A caller-chosen key that makes a retry safe: 16 to 128 characters of letters, digits, dash and underscore. */
export const IDEMPOTENCY_KEY = { type: 'string', pattern: '^[A-Za-z0-9_-]{16,128}$' } as const;
