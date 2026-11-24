// A cursor is refused when it comes from another query, order, state, caller, process or time.
import { expect, test } from 'bun:test';
import { createCursorCodec, CURSOR_LIFETIME_MS } from '../../src/server/mcp/cursors';

const binding = { query: 'list_files:{"project":"a"}', ordering: 'path', generation: 'g1', principal: 'local' };

test('a cursor opens only for the binding it was issued for', () => {
  let now = 1_000;
  const codec = createCursorCodec({ now: () => now });
  const cursor = codec.issue(50, binding);
  expect(codec.open(cursor, binding)).toBe(50);
  for (const other of [{ query: 'x' }, { ordering: 'name' }, { generation: 'g2' }, { principal: 'someone' }]) expect(codec.open(cursor, { ...binding, ...other })).toBeNull();
  now += CURSOR_LIFETIME_MS + 1;
  expect(codec.open(cursor, binding)).toBeNull();
});

test('a cursor from another process or with a changed body is refused', () => {
  const first = createCursorCodec();
  const restarted = createCursorCodec();
  const cursor = first.issue(7, binding);
  expect(restarted.open(cursor, binding)).toBeNull();
  const [payload, mac] = cursor.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), position: 9 })).toString('base64url');
  expect(first.open(`${forged}.${mac}`, binding)).toBeNull();
  expect(first.open('garbage', binding)).toBeNull();
});
