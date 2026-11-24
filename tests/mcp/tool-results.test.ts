// Byte ranges end on character boundaries and reproduce a large multi-byte file exactly; results carry the failure flag.
import { createHash } from 'node:crypto';
import { expect, test } from 'bun:test';
import { byteRange, fail, succeed, toCallToolResult, TOOL_ERROR_CODES } from '../../src/server/mcp/tool-results';

test('ranges of a 2,000,000-byte multi-byte file reproduce it exactly', () => {
  const unit = 'aé€😀\n';
  const source = unit.repeat(Math.ceil(2_000_000 / Buffer.byteLength(unit))).slice(0, 600_000);
  const bytes = Buffer.byteLength(source);
  expect(bytes).toBeGreaterThan(1_000_000);
  let offset = 0;
  let text = '';
  let pages = 0;
  while (true) {
    const range = byteRange(source, offset, 32_768);
    expect(Buffer.byteLength(range.text)).toBeLessThanOrEqual(32_768);
    text += range.text;
    pages++;
    if (range.nextOffset === undefined) break;
    offset = range.nextOffset;
  }
  expect(createHash('sha256').update(text).digest('hex')).toBe(createHash('sha256').update(source).digest('hex'));
  expect(pages).toBeGreaterThan(30);
});

test('a start inside a character moves to the next boundary and a tiny length still makes progress', () => {
  const range = byteRange('€€€', 1, 1);
  expect(range.offset).toBe(3);
  expect(range.text).toBe('€');
  expect(byteRange('😀', 0, 1).text).toBe('😀');
});

test('success and failure results carry the same object as structured content and text', () => {
  const ok = toCallToolResult(succeed({ a: 1 }));
  expect(ok.isError).toBeUndefined();
  expect(JSON.parse((ok.content[0] as { text: string }).text)).toEqual(ok.structuredContent as object);
  const failed = toCallToolResult(fail('conflict', 'changed', { currentVersion: 'x' }));
  expect(failed.isError).toBe(true);
  expect(new Set(TOOL_ERROR_CODES).size).toBe(16);
});
