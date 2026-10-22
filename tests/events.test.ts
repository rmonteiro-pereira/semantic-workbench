// Tests workspace event streaming, replay and external file changes.
import { test, expect } from 'bun:test';
import { appendFileSync } from 'node:fs';
import { createEvents } from '../server/projects/events';
import { testWorkspace } from './helpers/temp-data-dir';
// Events that carry no suggestion counting; the stubs keep a count round cheap.
const noSuggestions = { suggestionIndex: () => [], sharedSuggestionCount: () => 0 };
async function read(response: Response, until: (text: string) => boolean, timeout = 2000) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const stop = Date.now() + timeout;
  while (!until(text) && Date.now() < stop) {
    const r = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>(res =>
        setTimeout(() => res({ done: true, value: undefined }), stop - Date.now()),
      ),
    ]);
    if (r.done) break;
    text += decoder.decode(r.value);
  }
  await reader.cancel();
  return text;
}
const ids = (text: string) => [...text.matchAll(/^id: (\d+)$/gm)].map(m => +m[1]);
test('event ids increase and live events reach connected clients', async () => {
  const e = createEvents(noSuggestions);
  const response = e.stream(new Request('http://x/api/events'));
  expect(response.headers.get('content-type')).toBe('text/event-stream');
  setTimeout(() => {
    e.emit('files', { project: 'p', changed: ['a'], removed: [] }, { audience: 'all' });
    e.emit('projects', { added: ['p'], removed: [], renamed: [] }, { audience: 'all' });
  }, 20);
  const text = await read(response, t => ids(t).length >= 2);
  expect(ids(text)).toEqual([1, 2]);
  expect(text).toContain('event: files\ndata: {"project":"p","changed":["a"],"removed":[]}');
});
test('Last-Event-ID replays missed events from the ring; older ids get resync', async () => {
  const e = createEvents({ ...noSuggestions, ringSize: 1000 });
  for (let i = 0; i < 1005; i++) e.emit('files', { i }, { audience: 'all' });
  expect(e.replay(1005)).toEqual([]);
  expect(e.replay(1000)!.map(x => x.id)).toEqual([1001, 1002, 1003, 1004, 1005]);
  expect(e.replay(5)!.length).toBe(1000);
  expect(e.replay(4)).toBeNull();
  expect(e.replay(2000)).toBeNull();
  const replayed = await read(
    e.stream(new Request('http://x/api/events', { headers: { 'Last-Event-ID': '1003' } })),
    t => ids(t).length >= 2,
  );
  expect(ids(replayed)).toEqual([1004, 1005]);
  const resync = await read(
    e.stream(new Request('http://x/api/events', { headers: { 'Last-Event-ID': '1' } })),
    t => t.includes('resync'),
  );
  expect(resync).toContain('event: resync');
});
test('heartbeat comments keep the stream alive (15 s by default)', async () => {
  expect((await import('../server/projects/events')).HEARTBEAT_MS).toBe(15_000);
  const e = createEvents({ ...noSuggestions, heartbeatMs: 30 });
  const text = await read(
    e.stream(new Request('http://x/api/events')),
    t => t.includes(': ping'),
    1000,
  );
  expect(text).toContain(': ping');
});
test('/api/events applies the origin check and streams workspace changes', async () => {
  const t = await testWorkspace();
  try {
    expect(
      (
        await t.handler(
          new Request('http://127.0.0.1:4310/api/events', {
            headers: { origin: 'https://evil.example' },
          }),
        )
      ).status,
    ).toBe(403);
    const response = await t.handler(
      new Request('http://127.0.0.1:4310/api/events', {
        headers: { origin: 'http://127.0.0.1:5173' },
      }),
    );
    expect(response.status).toBe(200);
    setTimeout(
      () => void t.seed([{ path: 'a.yaml', source: 'name: A\nontology: [{concept: A}]' }]),
      20,
    );
    expect(await read(response, x => x.includes('event: projects'), 5000)).toContain(
      '"added":["a"]',
    );
  } finally {
    t.dispose();
  }
});
test('the watcher turns an external edit into a files event within 2 s', async () => {
  const t = await testWorkspace({ watch: true, debounceMs: 50 });
  try {
    await t.seed([{ path: 'a.yaml', source: 'name: A\nontology: [{concept: A}]\n' }]);
    const response = t.ws.events.stream(new Request('http://x/api/events'));
    const started = Date.now();
    setTimeout(() => appendFileSync(`${t.root}/projects/a/a.yaml`, '# note\n'), 50);
    const text = await read(response, x => x.includes('event: files'), 2000);
    expect(text).toContain('"changed":["a.yaml"]');
    expect(Date.now() - started).toBeLessThan(2000);
    expect(t.ws.cache.file('a', 'a.yaml')!.gitState).toBe('modified');
  } finally {
    t.dispose();
  }
});
