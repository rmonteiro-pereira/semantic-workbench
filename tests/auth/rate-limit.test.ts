// Token buckets per source address, and the once-a-minute gate for anonymous audit records.
import { expect, test } from 'bun:test';
import {
  ANONYMOUS_AUDIT_BURST,
  createAnonymousAuditGate,
  createRateLimitReport,
  createRateLimiter,
} from '../../server/auth/rate-limit';

function clock() {
  let milliseconds = 1_000_000;
  return {
    now: () => milliseconds,
    advance: (seconds: number) => (milliseconds += seconds * 1000),
  };
}

test('a source gets its burst, is refused after it, and is told when to retry', () => {
  const time = clock();
  const limiter = createRateLimiter({ burst: 3, perSecond: 0.5 }, time.now);
  expect([1, 2, 3].map(() => limiter.take('a').allowed)).toEqual([true, true, true]);
  const refused = limiter.take('a');
  expect(refused.allowed).toBe(false);
  expect(refused.retryAfterSeconds).toBe(2);
});

test('tokens return with time up to the burst and never beyond it', () => {
  const time = clock();
  const limiter = createRateLimiter({ burst: 2, perSecond: 1 }, time.now);
  limiter.take('a');
  limiter.take('a');
  expect(limiter.take('a').allowed).toBe(false);
  time.advance(1);
  expect(limiter.take('a').allowed).toBe(true);
  expect(limiter.take('a').allowed).toBe(false);
  time.advance(3600);
  expect([1, 2, 3].map(() => limiter.take('a').allowed)).toEqual([true, true, false]);
});

test('sources are limited independently', () => {
  const limiter = createRateLimiter({ burst: 1, perSecond: 0.001 }, clock().now);
  expect(limiter.take('a').allowed).toBe(true);
  expect(limiter.take('a').allowed).toBe(false);
  expect(limiter.take('b').allowed).toBe(true);
});

test('a source that hammers the limiter stays refused without earning tokens', () => {
  const time = clock();
  const limiter = createRateLimiter({ burst: 1, perSecond: 1 }, time.now);
  limiter.take('a');
  for (let attempt = 0; attempt < 5; attempt++) {
    time.advance(0.5);
    expect(limiter.take('a').allowed).toBe(attempt % 2 === 1);
  }
});

function recordedOf(gate: ReturnType<typeof createAnonymousAuditGate>, ip?: string) {
  let recorded = 0;
  for (let refusal = 0; refusal < ANONYMOUS_AUDIT_BURST + 10; refusal++) {
    if (gate(ip, 'sign-in-required').record) recorded++;
  }
  return recorded;
}

test('an anonymous refusal records its first few, then one a minute, per source and reason', () => {
  const time = clock();
  const gate = createAnonymousAuditGate(time.now);
  expect(recordedOf(gate, '10.0.0.1')).toBe(ANONYMOUS_AUDIT_BURST);
  expect(gate('10.0.0.1', 'token-invalid').record).toBe(true);
  expect(gate('10.0.0.2', 'sign-in-required').record).toBe(true);
  expect(recordedOf(gate)).toBe(ANONYMOUS_AUDIT_BURST);
  time.advance(59);
  expect(gate('10.0.0.1', 'sign-in-required').record).toBe(false);
  time.advance(1);
  expect(gate('10.0.0.1', 'sign-in-required').record).toBe(true);
  expect(gate('10.0.0.1', 'sign-in-required').record).toBe(false);
});

test('the next admitted record says how many refusals were left out', () => {
  const time = clock();
  const gate = createAnonymousAuditGate(time.now);
  let recorded = 0;
  for (let refusal = 0; refusal < 1000; refusal++) {
    const admission = gate('10.0.0.1', 'sign-in-required');
    if (admission.record) {
      recorded++;
      expect(admission.suppressed).toBe(0);
    }
  }
  expect(recorded).toBe(ANONYMOUS_AUDIT_BURST);
  time.advance(60);
  expect(gate('10.0.0.1', 'sign-in-required')).toEqual({
    record: true,
    suppressed: 1000 - ANONYMOUS_AUDIT_BURST,
  });
  time.advance(60);
  expect(gate('10.0.0.1', 'sign-in-required')).toEqual({ record: true, suppressed: 0 });
});

test('rate-limited sources are reported once a minute with their count', () => {
  const time = clock();
  const lines: string[] = [];
  const report = createRateLimitReport(time.now, line => lines.push(line));
  for (let refusal = 0; refusal < 50; refusal++) report('10.0.0.1');
  report('10.0.0.2');
  expect(lines).toEqual(['[http] rate-limited 10.0.0.1 1', '[http] rate-limited 10.0.0.2 1']);
  time.advance(60);
  report('10.0.0.1');
  expect(lines.at(-1)).toBe('[http] rate-limited 10.0.0.1 50');
});
