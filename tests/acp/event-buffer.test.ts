// The event buffer drops the oldest events once, says so once, and keeps a very long message whole.
import { expect, test } from 'bun:test';
import { createEventBuffer } from '../../src/server/acp/event-buffer';
import { plainText, viewContent } from '../../src/server/acp/panel-events';

const message = (text: string) => ({ type: 'message' as const, id: 'm', role: 'agent' as const, text, done: true });

test('events are numbered from one and a reader continues from its last number', () => {
  const buffer = createEventBuffer();
  for (let index = 0; index < 5; index++) buffer.append(message(String(index)));
  const caught = buffer.since(3);
  expect(caught.events.map(event => event.seq)).toEqual([4, 5]);
  expect(caught.gap).toBe(false);
  expect(buffer.since(0).events).toHaveLength(5);
});

test('past the event limit the oldest are dropped and exactly one notice is added', () => {
  const buffer = createEventBuffer({ events: 10, bytes: 10 ** 9 });
  for (let index = 0; index < 100; index++) buffer.append(message('x'));
  const all = buffer.since(0);
  expect(all.events.length).toBeLessThanOrEqual(11);
  expect(all.events.filter(event => event.type === 'notice')).toHaveLength(1);
  expect(all.events.at(-1)?.seq).toBe(buffer.lastSeq);
  expect(buffer.since(2).gap).toBe(true);
  expect(buffer.since(buffer.lastSeq - 1).gap).toBe(false);
});

test('past the byte limit the oldest are dropped', () => {
  const buffer = createEventBuffer({ events: 1000, bytes: 10_000 });
  for (let index = 0; index < 50; index++) buffer.append(message('y'.repeat(1000)));
  expect(buffer.size.bytes).toBeLessThanOrEqual(10_000 + 2000);
  expect(buffer.size.events).toBeLessThan(20);
});

test('a one million character message alone is kept whole', () => {
  const buffer = createEventBuffer();
  const big = 'z'.repeat(1_000_000);
  buffer.append(message(big));
  const [event] = buffer.since(0).events;
  expect(event.type === 'message' && event.text.length).toBe(1_000_000);
});

test('an event larger than the byte limit alone is still kept', () => {
  const buffer = createEventBuffer({ events: 10, bytes: 100 });
  buffer.append(message('q'.repeat(5000)));
  expect(buffer.since(0).events.some(event => event.type === 'message')).toBe(true);
});

test('markup and script text stay text, and control characters vanish', () => {
  const html = '<script>alert(1)</script><img src=x onerror=1>';
  expect(plainText(html)).toBe(html);
  expect(plainText('a\u0000b\u001bc\nd\te')).toBe('abc\nd\te');
  expect(plainText('file‮gnp.exe')).toBe('file<U+202E>gnp.exe');
  expect(viewContent({ type: 'text', text: html })).toEqual({ kind: 'text', text: html });
});

test('other content kinds become a notice naming kind and size', () => {
  const view = viewContent({ type: 'image', data: 'a'.repeat(5000), mimeType: 'image/png' });
  expect(view.kind).toBe('other');
  expect(view.kind === 'other' && view.notice).toContain('image');
  expect(viewContent({ type: '<b>evil</b>' }).kind === 'other' && (viewContent({ type: '<b>evil</b>' }) as { notice: string }).notice).toContain('unknown');
  expect(viewContent(null).kind).toBe('other');
  expect(viewContent('plain string').kind).toBe('other');
});
