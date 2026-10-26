// Checks revocation and attempt replay protection using deterministic clocks.
import { expect, test } from 'bun:test';
import { createSessionStore } from '../../src/server/auth/sessions';
import { createAttemptStore, ATTEMPT_TTL_SECONDS } from '../../src/server/auth/attempts';
import { localPrincipal } from '../../src/server/auth/principal';
import { createEvents } from '../../src/server/projects/events';
import { tempDataDir } from '../helpers/temp-data-dir';
// Events that carry no suggestion counting; the stubs keep a count round cheap.
const noSuggestions = { suggestionIndex: () => [], sharedSuggestionCount: () => 0 };

test('idle expiry and administrative termination close live streams', async () => {
  for (const reason of ['expiry', 'admin'] as const) {
    const fixture = tempDataDir('session-events-');
    try {
      let now = 1000;
      const store = createSessionStore({
        dir: fixture.root,
        key: new Uint8Array(32).fill(1),
        now: () => now,
        idleHours: 1,
        absoluteHours: 2,
      });
      const session = await store.create({
        principal: localPrincipal(),
        tokens: { accessToken: 'secret', expiresAt: 90000 },
      });
      const events = createEvents(noSuggestions);
      const response = events.stream(new Request('http://localhost/api/events'), listener =>
        store.subscribe(session.id, listener),
      );
      const reader = response.body!.getReader();
      await reader.read();
      if (reason === 'admin') await store.endPrincipal(session.principal.id);
      else {
        now += 3600000;
        await store.sweep();
      }
      expect(new TextDecoder().decode((await reader.read()).value)).toContain('session-ended');
      expect((await reader.read()).done).toBe(true);
      expect(events.clientCount).toBe(0);
      expect(await store.get(session.id)).toBeNull();
    } finally {
      fixture.cleanup();
    }
  }
});

test('signed attempts expire, reject tampering and cannot replay after restart', () => {
  const fixture = tempDataDir('auth-attempts-');
  try {
    let now = 1000;
    const key = new Uint8Array(32).fill(1);
    const store = createAttemptStore(key, fixture.root, () => now);
    const attempt = {
      state: 'state',
      nonce: 'nonce',
      verifier: 'verifier',
      returnTo: '/',
      issuedAt: now,
    };
    const cookie = store.encode(attempt);
    expect(() => store.consume(cookie + 'bad')).toThrow();
    expect(store.consume(cookie)).toEqual(attempt);
    expect(() => createAttemptStore(key, fixture.root, () => now).consume(cookie)).toThrow();
    const expired = store.encode({ ...attempt, state: 'other-state' });
    now += ATTEMPT_TTL_SECONDS * 1000;
    expect(() => store.consume(expired)).toThrow();
  } finally {
    fixture.cleanup();
  }
});
