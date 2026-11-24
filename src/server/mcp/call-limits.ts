// Limits how fast and how many tool calls one caller may run at once, and how long one call may take. The clock is passed in so tests do not wait.

/** Calls per second a caller may sustain, the burst it may spend at once, calls it may run together and the time one call gets. */
export type CallLimitSettings = { callsPerSecond: number; burst: number; concurrent: number; deadlineMs: number };

/** Defaults: well under the 200 requests per second the HTTP boundary allows, and under the server's idle limit. */
export const DEFAULT_CALL_LIMITS: CallLimitSettings = { callsPerSecond: 20, burst: 40, concurrent: 4, deadlineMs: 30_000 };

export type CallPermit = { release(): void };
export type Admission = { ok: true; permit: CallPermit } | { ok: false; reason: 'rate' | 'concurrency'; retryAfterSeconds: number };

/** Admits calls for one caller with a token bucket and a concurrency counter. */
export function createCallLimits(settings: CallLimitSettings = DEFAULT_CALL_LIMITS, now: () => number = Date.now) {
  let tokens = settings.burst;
  let refilledAt = now();
  let running = 0;
  function refill() {
    const current = now();
    tokens = Math.min(settings.burst, tokens + ((current - refilledAt) / 1000) * settings.callsPerSecond);
    refilledAt = current;
  }
  return {
    settings,
    admit(): Admission {
      refill();
      if (running >= settings.concurrent) return { ok: false, reason: 'concurrency', retryAfterSeconds: 1 };
      if (tokens < 1) return { ok: false, reason: 'rate', retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / settings.callsPerSecond)) };
      tokens -= 1;
      running += 1;
      let released = false;
      return {
        ok: true,
        permit: {
          release() {
            if (released) return;
            released = true;
            running -= 1;
          },
        },
      };
    },
  };
}

export type CallLimits = ReturnType<typeof createCallLimits>;

/** Runs work under a deadline. The signal tells the work to stop; the answer says whether it finished in time. */
export async function withDeadline<T>(deadlineMs: number, work: (signal: AbortSignal) => Promise<T>): Promise<{ finished: true; value: T } | { finished: false }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<{ finished: false }>(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ finished: false });
    }, deadlineMs);
  });
  try {
    return await Promise.race([work(controller.signal).then(value => ({ finished: true as const, value })), expired]);
  } finally {
    clearTimeout(timer);
  }
}
