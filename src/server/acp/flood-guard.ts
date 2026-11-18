// Bounds what an agent may ask for: the call limits of the model-protocol surface, a sustained-flood rule and a repeated-oversize rule.
import { DEFAULT_CALL_LIMITS, createCallLimits, type CallLimitSettings, type CallPermit } from '../mcp/call-limits';

/** How long the agent may stay above the burst limit before the session ends, in milliseconds. */
export const FLOOD_WINDOW_MS = 5_000;
/** A pause in refusals this long means the agent backed off, so the flood clock starts again. */
export const FLOOD_PAUSE_MS = 1_000;
/** How many oversize frames in a row end the session. */
export const OVERSIZE_FRAMES_IN_A_ROW = 2;

/** The answer to one request from the agent. `flood` is true when the session should end. */
export type Admission = { ok: true; permit: CallPermit } | { ok: false; reason: 'rate' | 'concurrency'; retryAfterSeconds: number; flood: boolean };

/** One guard per session, so the limits are per person. */
export function createFloodGuard(options: { now: () => number; settings?: CallLimitSettings }) {
  const limits = createCallLimits(options.settings ?? DEFAULT_CALL_LIMITS, options.now);
  let refusedSince: number | undefined;
  let lastRefusedAt: number | undefined;
  let oversizeInARow = 0;

  return {
    /** Admits one request, or refuses it and says whether the refusals have gone on long enough to end the session. */
    admit(): Admission {
      const admission = limits.admit();
      if (admission.ok) return admission;
      const now = options.now();
      // A token bucket admits a few calls even under a flood, so only a pause in the refusals, not an admission, restarts the clock.
      if (lastRefusedAt === undefined || now - lastRefusedAt > FLOOD_PAUSE_MS) refusedSince = now;
      lastRefusedAt = now;
      return { ...admission, flood: now - (refusedSince ?? now) >= FLOOD_WINDOW_MS };
    },
    /** Notes one frame's size result. Returns true when enough oversize frames came in a row to end the session. */
    noteFrame(oversize: boolean): boolean {
      oversizeInARow = oversize ? oversizeInARow + 1 : 0;
      return oversizeInARow >= OVERSIZE_FRAMES_IN_A_ROW;
    },
    get settings(): CallLimitSettings {
      return limits.settings;
    },
  };
}

export type FloodGuard = ReturnType<typeof createFloodGuard>;
