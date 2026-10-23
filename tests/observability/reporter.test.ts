// The browser reporter holds reports until the server wants them, sends them in bounded batches
// and never retries.
import { describe, expect, test } from 'bun:test';
import {
  MAX_REPORTS_PER_REQUEST,
  type BrowserReport,
  type ErrorReport,
} from '../../src/observability/browser-report';
import {
  createReporter,
  DEFAULT_REPORTER_LIMITS,
  topFrames,
} from '../../src/observability/reporter';

function setup(status = 204, limits = DEFAULT_REPORTER_LIMITS) {
  const batches: BrowserReport[][] = [];
  const timers: (() => void)[] = [];
  let clock = 0;
  const reporter = createReporter({
    send: async reports => {
      batches.push(reports);
      return status;
    },
    now: () => clock,
    schedule: work => timers.push(work),
    limits,
  });
  return {
    reporter,
    batches,
    advance: (ms: number) => (clock += ms),
    runTimers: async () => {
      while (timers.length) timers.shift()!();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe('waiting for the server', () => {
  test('nothing is sent before the server says reports are wanted', async () => {
    const { reporter, batches, runTimers } = setup();
    reporter.reportError('error', new TypeError('boom'));
    await runTimers();
    expect(batches).toEqual([]);
    expect(reporter.queued).toBe(1);
  });

  test('enabling sends what waited', async () => {
    const { reporter, batches, runTimers } = setup();
    reporter.reportError('error', new TypeError('boom'));
    reporter.enable();
    await runTimers();
    expect(batches).toHaveLength(1);
    expect(batches[0][0]).toMatchObject({ kind: 'error', name: 'TypeError', message: 'boom' });
  });

  test('disabling forgets everything and keeps forgetting', async () => {
    const { reporter, batches, runTimers } = setup();
    reporter.reportError('error', new Error('one'));
    reporter.disable();
    reporter.reportError('error', new Error('two'));
    reporter.enable();
    await runTimers();
    expect(reporter.queued).toBe(0);
    expect(batches).toEqual([]);
  });
});

describe('what is sent', () => {
  test('a message is scrubbed of quoted text and cut', async () => {
    const { reporter, batches, runTimers } = setup();
    reporter.enable();
    reporter.reportError('error', new SyntaxError(`Unexpected "salary: 90000" ${'x'.repeat(500)}`));
    await runTimers();
    const report = batches[0][0] as ErrorReport;
    expect(report.message).not.toContain('salary');
    expect(report.message.length).toBeLessThanOrEqual(200);
  });

  test('a value that is not an Error still becomes a report', async () => {
    const { reporter, batches, runTimers } = setup();
    reporter.enable();
    reporter.reportError('unhandled-rejection', 'plain string');
    await runTimers();
    expect(batches[0][0]).toMatchObject({ kind: 'unhandled-rejection', message: 'plain string' });
  });

  test('the same error is sent once per page', async () => {
    const { reporter, batches, runTimers } = setup();
    reporter.enable();
    for (let repeat = 0; repeat < 5; repeat++) reporter.reportError('error', new Error('again'));
    await runTimers();
    expect(batches.flat()).toHaveLength(1);
  });

  test('only slow operations and the page load are reported', async () => {
    const { reporter, batches, runTimers } = setup();
    reporter.enable();
    reporter.reportOperation('validation', 120);
    reporter.reportOperation('validation', 900);
    reporter.reportOperation('page-load', 1500);
    await runTimers();
    expect(batches.flat()).toEqual([
      { kind: 'operation', operation: 'validation', durationMs: 900 },
      { kind: 'operation', operation: 'page-load', durationMs: 1500 },
    ]);
  });

  test('a slow operation repeats at most once in the minimum gap', async () => {
    const { reporter, batches, runTimers, advance } = setup();
    reporter.enable();
    reporter.reportOperation('save', 5000);
    reporter.reportOperation('save', 6000);
    advance(DEFAULT_REPORTER_LIMITS.slowOperationGapMs);
    reporter.reportOperation('save', 7000);
    await runTimers();
    expect(batches.flat().map(report => (report as { durationMs: number }).durationMs)).toEqual([
      5000, 7000,
    ]);
  });
});

describe('limits', () => {
  test('a batch holds at most the number the server accepts', async () => {
    const { reporter, batches, runTimers } = setup();
    reporter.enable();
    for (let index = 0; index < 30; index++) reporter.reportError('error', new Error(`e${index}`));
    await runTimers();
    await runTimers();
    expect(batches[0]).toHaveLength(MAX_REPORTS_PER_REQUEST);
    expect(batches.flat()).toHaveLength(30);
  });

  test('the queue and the page total are bounded', async () => {
    const limits = { ...DEFAULT_REPORTER_LIMITS, queued: 5, perSession: 8 };
    const { reporter, batches, runTimers } = setup(204, limits);
    for (let index = 0; index < 20; index++) reporter.reportError('error', new Error(`e${index}`));
    expect(reporter.queued).toBe(5);
    reporter.enable();
    await runTimers();
    expect(batches.flat().length).toBeLessThanOrEqual(8);
  });

  test('a refusal from the server stops all later sending', async () => {
    const { reporter, batches, runTimers } = setup(404);
    reporter.enable();
    reporter.reportError('error', new Error('first'));
    await runTimers();
    reporter.reportError('error', new Error('second'));
    await runTimers();
    expect(batches).toHaveLength(1);
  });

  test('a failed send drops its batch instead of retrying it', async () => {
    const batches: BrowserReport[][] = [];
    const timers: (() => void)[] = [];
    const reporter = createReporter({
      send: async reports => {
        batches.push(reports);
        throw new Error('offline');
      },
      schedule: work => timers.push(work),
    });
    reporter.enable();
    reporter.reportError('error', new Error('x'));
    timers.shift()!();
    await Promise.resolve();
    await Promise.resolve();
    expect(batches).toHaveLength(1);
    expect(reporter.queued).toBe(0);
    expect(timers).toHaveLength(0);
  });
});

describe('stack frames', () => {
  test('only the first frames are kept', () => {
    const lines = Array.from({ length: 20 }, (_, index) => `    at f${index} (a.js:1:${index})`);
    expect(topFrames(lines.join('\n'))!.split('\n')).toHaveLength(5);
    expect(topFrames(undefined)).toBeUndefined();
  });

  test('the message line of a stack, which may quote a document, is never kept', () => {
    const stack =
      'SyntaxError: Unexpected "salary: 90000"\n    at parse (app.js:10:5)\nrun@app.js:3:1';
    const frames = topFrames(stack)!;
    expect(frames).not.toContain('salary');
    expect(frames).toContain('at parse (app.js:10:5)');
    expect(frames).toContain('run@app.js:3:1');
  });

  test('an error whose stack is only a message has no frames', () => {
    expect(topFrames('Error: just text')).toBeUndefined();
  });
});
