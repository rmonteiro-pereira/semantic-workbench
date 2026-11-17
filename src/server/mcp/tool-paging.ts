// Pages a list the tool already holds in order. Each page is authorized again by its twin call, the cursor is bound to the list's state, and a page stops early when its text would pass the result cap.
import { createHash } from 'node:crypto';
import type { ToolContext } from './tool-definition';
import { fail, pageSize, RESULT_CAP_BYTES, type ToolResult } from './tool-results';

/** The arguments every list tool shares. */
export const PAGE_ARGUMENTS = {
  limit: { type: 'integer', minimum: 1, maximum: 200 },
  cursor: { type: 'string', maxLength: 2048 },
} as const;

export type Page<T> = { items: T[]; nextCursor?: string };

/** What a page request is bound to: the tool and its query, the order of the list and the state it was read in. */
export function pageBinding(tool: string, query: unknown, ordering: string, items: unknown[], context: ToolContext) {
  const generation = createHash('sha256').update(JSON.stringify(items)).digest('hex');
  return { query: `${tool}:${JSON.stringify(query)}`, ordering, generation, principal: context.principalId };
}

/** Returns one page of `items`, or the failure a stale or foreign cursor deserves. */
export function pageOf<T>(
  items: T[],
  args: { limit?: number; cursor?: string },
  context: ToolContext,
  binding: ReturnType<typeof pageBinding>,
): { ok: true; page: Page<T> } | { ok: false; failure: ToolResult } {
  let start = 0;
  if (args.cursor !== undefined) {
    const position = context.cursors.open(args.cursor, binding);
    if (position === null || position > items.length)
      return { ok: false, failure: fail('cursor_expired', 'The cursor belongs to another query, to a list that changed, to another caller or is too old. Start again without a cursor.') };
    start = position;
  }
  const limit = pageSize(args.limit);
  const page: T[] = [];
  let bytes = 0;
  for (let index = start; index < items.length && page.length < limit; index++) {
    bytes += Buffer.byteLength(JSON.stringify(items[index]));
    if (page.length > 0 && bytes > RESULT_CAP_BYTES) break;
    page.push(items[index]);
  }
  const end = start + page.length;
  return { ok: true, page: { items: page, ...(end < items.length ? { nextCursor: context.cursors.issue(end, binding) } : {}) } };
}
