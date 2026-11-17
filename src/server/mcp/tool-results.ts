// The shapes every tool answers with, the closed set of failure codes, and the byte ranges that keep a result under its cap.
import type { CallToolResult } from '@modelcontextprotocol/server';

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

/** What a tool answers: data on success, or a code with a plain sentence and optional details. */
export type ToolResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: { code: ToolErrorCode; message: string; details?: Record<string, unknown> } };

/** Largest amount of file or diff text one result carries. About 8,000 tokens, under the size at which agents warn about a tool result. */
export const RESULT_CAP_BYTES = 32_768;
/** Items per page when a caller names no limit, and the most a caller may ask for. */
export const DEFAULT_PAGE_SIZE = 50;
export const MAXIMUM_PAGE_SIZE = 200;

export function succeed(data: Record<string, unknown>): ToolResult {
  return { ok: true, data };
}

export function fail(code: ToolErrorCode, message: string, details?: Record<string, unknown>): ToolResult {
  return { ok: false, error: { code, message, ...(details ? { details } : {}) } };
}

/** The protocol result: the same object as structured content and as JSON text, with the error flag set on failure. */
export function toCallToolResult(result: ToolResult): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
    ...(result.ok ? {} : { isError: true }),
  };
}

/** A UTF-8 continuation byte, which can never start a character. */
function isContinuation(byte: number): boolean {
  return (byte & 0b1100_0000) === 0b1000_0000;
}

export type TextRange = { text: string; offset: number; nextOffset?: number; size: number };

/**
 * Cuts a byte range out of text so it starts and ends on character boundaries. A start inside a
 * character moves forward to the next boundary, and the reported `nextOffset` is always a boundary,
 * so following it from zero reproduces the text exactly.
 */
export function byteRange(source: string, requestedOffset: number, requestedLength: number): TextRange {
  const bytes = new TextEncoder().encode(source);
  const size = bytes.length;
  let start = Math.min(requestedOffset, size);
  while (start < size && isContinuation(bytes[start])) start++;
  let end = Math.min(start + Math.min(requestedLength, RESULT_CAP_BYTES), size);
  while (end > start && end < size && isContinuation(bytes[end])) end--;
  // A character wider than the requested length still has to make progress.
  if (end === start && start < size) {
    end = start + 1;
    while (end < size && isContinuation(bytes[end])) end++;
  }
  const text = new TextDecoder().decode(bytes.slice(start, end));
  return { text, offset: start, size, ...(end < size ? { nextOffset: end } : {}) };
}

/** Limits and defaults of a list tool's page, validated by the tool's schema. */
export function pageSize(limit: number | undefined): number {
  return Math.min(limit ?? DEFAULT_PAGE_SIZE, MAXIMUM_PAGE_SIZE);
}
