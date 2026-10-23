// Limits how often one source address may act, so an unauthenticated loop cannot exhaust the
// workbench's own resources.

import { log } from '../observability/log';

/** A bucket holds `burst` requests and refills `perSecond` of them every second. */
export type RateLimit = { burst: number; perSecond: number };

/** The answer to one request: whether it may proceed, and when a refused caller may retry. */
export type RateDecision = { allowed: boolean; retryAfterSeconds: number };

/** How many sources are remembered at once; the least recently seen is forgotten first. */
const MAX_TRACKED_SOURCES = 10_000;

/**
 * Token-bucket limiter keyed by an arbitrary string, usually a source address. Time comes from
 * the caller so tests control it.
 */
export function createRateLimiter(limit: RateLimit, now: () => number = Date.now) {
  const buckets = new Map<string, { tokens: number; refilledAt: number }>();
  return {
    take(key: string): RateDecision {
      const current = now();
      const bucket = buckets.get(key) ?? { tokens: limit.burst, refilledAt: current };
      const elapsedSeconds = Math.max(0, current - bucket.refilledAt) / 1000;
      bucket.tokens = Math.min(limit.burst, bucket.tokens + elapsedSeconds * limit.perSecond);
      bucket.refilledAt = current;
      const allowed = bucket.tokens >= 1;
      if (allowed) bucket.tokens -= 1;
      // Re-inserting keeps the map ordered by last use, so eviction drops the idlest source.
      buckets.delete(key);
      buckets.set(key, bucket);
      if (buckets.size > MAX_TRACKED_SOURCES) buckets.delete(buckets.keys().next().value!);
      const missing = Math.max(0, 1 - bucket.tokens);
      return { allowed, retryAfterSeconds: Math.max(1, Math.ceil(missing / limit.perSecond)) };
    },
  };
}

/** The limits of the HTTP boundary. */
export type RequestLimits = {
  /** Every request of one source address. */
  requests: RateLimit;
  /** Starting a sign-in or finishing one, each of which costs a call to the identity provider. */
  signIn: RateLimit;
};

/**
 * Generous enough for a busy browser session. Behind a reverse proxy the source address is the
 * proxy's, so these also have to hold everyone who signs in through it.
 */
export const DEFAULT_REQUEST_LIMITS: RequestLimits = {
  requests: { burst: 1000, perSecond: 200 },
  signIn: { burst: 60, perSecond: 2 },
};

/** Paths whose handling calls the identity provider on behalf of an anonymous visitor. */
export const SIGN_IN_PATHS: ReadonlySet<string> = new Set(['/auth/login', '/auth/callback']);

/** How many refusals of one kind from one source are recorded before the gate slows down. */
export const ANONYMOUS_AUDIT_BURST = 20;

/** The gate's answer: whether to record, and how many refusals were left out before this one. */
export type AuditAdmission = { record: boolean; suppressed: number };

/**
 * Decides whether an anonymous refusal is written to the durable audit log. Each source address
 * and reason records its first refusals, then one a minute, so a loop of refused requests cannot
 * fill the disk while the start of every attack stays visible. The next record that is admitted
 * says how many were left out, so the volume is not lost.
 */
export function createAnonymousAuditGate(now: () => number = Date.now) {
  const limiter = createRateLimiter({ burst: ANONYMOUS_AUDIT_BURST, perSecond: 1 / 60 }, now);
  const suppressedByKey = new Map<string, number>();
  return (sourceIp: string | undefined, reason: string): AuditAdmission => {
    const key = `${sourceIp ?? 'unknown'}|${reason}`;
    const suppressed = suppressedByKey.get(key) ?? 0;
    if (!limiter.take(key).allowed) {
      suppressedByKey.delete(key);
      suppressedByKey.set(key, suppressed + 1);
      if (suppressedByKey.size > MAX_TRACKED_SOURCES) {
        suppressedByKey.delete(suppressedByKey.keys().next().value!);
      }
      return { record: false, suppressed: 0 };
    }
    suppressedByKey.delete(key);
    return { record: true, suppressed };
  };
}

/** How long refusals of one source are counted before the next log line. */
const REPORT_INTERVAL_MS = 60_000;

/**
 * Reports refused (429) sources to the server log: one line per source per minute with the
 * number of refusals since the last line, so a flood leaves a trace without a line per request.
 */
export function createRateLimitReport(
  now: () => number = Date.now,
  write: (source: string, refused: number) => void = (source, refused) =>
    log.warn('http.rate-limited', { client: source, refused }),
) {
  const sources = new Map<string, { count: number; reportedAt: number }>();
  return (source: string) => {
    const current = now();
    const entry = sources.get(source) ?? { count: 0, reportedAt: Number.NEGATIVE_INFINITY };
    entry.count += 1;
    if (current - entry.reportedAt >= REPORT_INTERVAL_MS) {
      write(source, entry.count);
      entry.count = 0;
      entry.reportedAt = current;
    }
    sources.delete(source);
    sources.set(source, entry);
    if (sources.size > MAX_TRACKED_SOURCES) sources.delete(sources.keys().next().value!);
  };
}
