// Frames cross the link in order, once each, even when transmissions are lost and the relay reconnects.
import { expect, test } from 'bun:test';
import { HEARTBEAT_GRACE_MS, createFrameLink } from '../../src/server/acp/frame-link';

function link(limits?: { frames: number; bytes: number }) {
  let time = 0;
  const instance = createFrameLink({ now: () => time, limits });
  return { instance, advance: (milliseconds: number) => (time += milliseconds) };
}

test('frames are numbered from one and replay returns those after a number', () => {
  const { instance } = link();
  for (const text of ['a', 'b', 'c']) instance.send(text);
  expect(instance.replayAfter(1).map(frame => frame.payload)).toEqual(['b', 'c']);
  expect(instance.replayAfter(0)).toHaveLength(3);
});

test('an acknowledgement frees frames and a stale or impossible one changes nothing', () => {
  const { instance } = link();
  for (const text of ['a', 'b', 'c']) instance.send(text);
  instance.acknowledge(2);
  expect(instance.pending.frames).toBe(1);
  instance.acknowledge(1);
  instance.acknowledge(99);
  instance.acknowledge(Number.NaN);
  expect(instance.pending.frames).toBe(1);
  expect(instance.lastAcknowledged).toBe(2);
});

test('the replay buffer refuses a frame past its frame or byte limit and accepts again after an acknowledgement', () => {
  const { instance } = link({ frames: 3, bytes: 100 });
  for (let index = 0; index < 3; index++) expect(instance.send('x').ok).toBe(true);
  expect(instance.send('x')).toEqual({ ok: false, reason: 'replay-full' });
  instance.acknowledge(3);
  expect(instance.send('y'.repeat(100)).ok).toBe(true);
  expect(instance.send('z')).toEqual({ ok: false, reason: 'replay-full' });
});

test('incoming frames: in order accepted, repeats dropped, skips are gaps', () => {
  const { instance } = link();
  expect(instance.accept(1)).toBe('accepted');
  expect(instance.accept(1)).toBe('duplicate');
  expect(instance.accept(3)).toBe('gap');
  expect(instance.accept(2)).toBe('accepted');
  expect(instance.accept(0)).toBe('gap');
  expect(instance.accept(1.5)).toBe('gap');
  expect(instance.lastReceived).toBe(2);
});

test('the relay counts as lost after the grace and any request resets the clock', () => {
  const { instance, advance } = link();
  advance(HEARTBEAT_GRACE_MS - 1);
  expect(instance.lost()).toBe(false);
  instance.heard();
  advance(HEARTBEAT_GRACE_MS - 1);
  expect(instance.lost()).toBe(false);
  advance(1);
  expect(instance.lost()).toBe(true);
});

/** A small deterministic random source so the property run repeats. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

test('one hundred random drops and reconnects lose no frame and repeat none, in both directions', () => {
  const next = random(42);
  const { instance } = link();
  const total = 1000;
  const delivered: string[] = [];
  const toRelay: string[] = [];
  let reconnects = 0;

  // The relay sends numbered frames; each transmission may be lost. It resends from the last number the workbench confirmed.
  const relayFrames = Array.from({ length: total }, (_unused, index) => ({ seq: index + 1, payload: `from-${index + 1}` }));
  let relayConfirmed = 0;
  let relayInFlight = 0;
  let workbenchSent = 0;

  while (delivered.length < total || toRelay.length < total) {
    if (workbenchSent < total) {
      workbenchSent += 1;
      const sent = instance.send(`to-${workbenchSent}`);
      if (!sent.ok) throw new Error('replay buffer filled during the property run');
    }
    // The relay posts a batch of its next frames; a random subset is lost on the way.
    const batch = relayFrames.slice(relayConfirmed, relayConfirmed + 5);
    for (const frame of batch) {
      if (next() < 0.3) continue;
      const result = instance.accept(frame.seq);
      if (result === 'accepted') delivered.push(frame.payload);
    }
    relayInFlight = batch.length;
    // The answer carries lastReceived; it may itself be lost, in which case the relay resends and duplicates are dropped.
    if (next() >= 0.2) relayConfirmed = instance.lastReceived;
    // A stream carries workbench frames to the relay; a drop makes the relay reconnect with the last number it saw.
    const seenByRelay = toRelay.length;
    const stream = instance.replayAfter(seenByRelay).slice(0, 7);
    for (const frame of stream) {
      if (next() < 0.25) {
        reconnects += 1;
        break;
      }
      toRelay.push(frame.payload);
      instance.acknowledge(frame.seq);
    }
    if (relayInFlight === 0 && workbenchSent === total && toRelay.length === total) break;
  }
  expect(delivered).toEqual(relayFrames.map(frame => frame.payload));
  expect(toRelay).toEqual(Array.from({ length: total }, (_unused, index) => `to-${index + 1}`));
  expect(reconnects).toBeGreaterThanOrEqual(100);
});
