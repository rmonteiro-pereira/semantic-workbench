// The agent gets the same call limits as other agent surfaces, and a sustained flood or repeated oversize frames end the session.
import { expect, test } from 'bun:test';
import { DEFAULT_CALL_LIMITS } from '../../src/server/mcp/call-limits';
import { FLOOD_WINDOW_MS, createFloodGuard } from '../../src/server/acp/flood-guard';

function guard() {
  let time = 0;
  const instance = createFloodGuard({ now: () => time, settings: { ...DEFAULT_CALL_LIMITS, concurrent: 1000 } });
  return { instance, advance: (milliseconds: number) => (time += milliseconds) };
}

test('a burst of forty passes and the forty-first is limited without ending the session', () => {
  const { instance } = guard();
  for (let call = 0; call < 40; call++) expect(instance.admit().ok).toBe(true);
  const refused = instance.admit();
  expect(refused).toMatchObject({ ok: false, reason: 'rate', flood: false });
});

test('refusals that keep coming for five seconds end the session', () => {
  const { instance, advance } = guard();
  for (let call = 0; call < 40; call++) instance.admit();
  let flood = false;
  let seconds = 0;
  while (!flood && seconds < 10) {
    advance(100);
    seconds += 0.1;
    // Ten calls every tenth of a second is far above the twenty a second the guard refills.
    for (let burst = 0; burst < 10; burst++) {
      const admission = instance.admit();
      if (!admission.ok && admission.flood) flood = true;
    }
  }
  expect(flood).toBe(true);
  expect(seconds).toBeGreaterThanOrEqual(FLOOD_WINDOW_MS / 1000 - 0.2);
  expect(seconds).toBeLessThan(6);
});

test('a pause of more than a second between refusals restarts the flood clock', () => {
  const { instance, advance } = guard();
  for (let call = 0; call < 41; call++) instance.admit();
  for (let round = 0; round < 20; round++) {
    advance(1500);
    for (let call = 0; call < 45; call++) instance.admit();
    const refused = instance.admit();
    expect(refused.ok === false && refused.flood).toBe(false);
  }
});

test('two oversize frames in a row end the session and a good frame between resets the count', () => {
  const { instance } = guard();
  expect(instance.noteFrame(true)).toBe(false);
  expect(instance.noteFrame(false)).toBe(false);
  expect(instance.noteFrame(true)).toBe(false);
  expect(instance.noteFrame(true)).toBe(true);
});

test('the guard uses the shared call limits by default', () => {
  const instance = createFloodGuard({ now: () => 0 });
  expect(instance.settings).toEqual(DEFAULT_CALL_LIMITS);
});
