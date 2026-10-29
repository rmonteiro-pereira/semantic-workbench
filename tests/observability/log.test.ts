// The logger filters by level, writes JSON lines or readable lines, redacts, and tags each line
// with the request being handled.
import { describe, expect, test } from 'bun:test';
import { createLogger, formatRecord, type LogRecord } from '../../src/server/observability/log';
import { runInRequest } from '../../src/server/observability/request-context';
import { parseLevel } from './log-helpers';

const fixedClock = () => new Date('2026-10-23T12:30:45.000Z');

function capture(level: Parameters<typeof createLogger>[0]['level'], format: 'json' | 'text') {
  const lines: { line: string; level: string }[] = [];
  const records: LogRecord[] = [];
  const logger = createLogger(
    {
      level,
      format,
      clock: fixedClock,
      write: (line, lineLevel) => lines.push({ line, level: lineLevel }),
    },
    [record => records.push(record)],
  );
  return { logger, lines, records };
}

describe('levels', () => {
  test('a level hides everything below it', () => {
    const { logger, lines } = capture('warn', 'json');
    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d');
    expect(lines.map(entry => JSON.parse(entry.line).event)).toEqual(['c', 'd']);
  });

  test('debug shows everything and silent shows nothing', () => {
    const everything = capture('debug', 'json');
    everything.logger.debug('a');
    everything.logger.error('b');
    expect(everything.lines).toHaveLength(2);
    const nothing = capture('silent', 'json');
    nothing.logger.error('b');
    expect(nothing.lines).toHaveLength(0);
    expect(nothing.records).toHaveLength(0);
  });

  test('a level name from the environment is read case-insensitively', () => {
    expect(parseLevel('WARN')).toBe('warn');
    expect(parseLevel(undefined)).toBe('info');
  });
});

describe('format', () => {
  test('json mode writes one parseable object per line', () => {
    const { logger, lines } = capture('info', 'json');
    logger.info('http.request', { status: 200, route: '/api/me' });
    expect(lines).toHaveLength(1);
    expect(lines[0].line.includes('\n')).toBe(false);
    expect(JSON.parse(lines[0].line)).toEqual({
      time: '2026-10-23T12:30:45.000Z',
      level: 'info',
      event: 'http.request',
      status: 200,
      route: '/api/me',
    });
  });

  test('text mode writes a readable line', () => {
    const { logger, lines } = capture('info', 'text');
    logger.warn('git.slow', { subcommand: 'fetch', durationMs: 4200, note: 'two words' });
    expect(lines[0].line).toBe('12:30:45 WARN  git.slow subcommand=fetch durationMs=4200 note="two words"');
  });

  test('formatRecord is a pure function of the record', () => {
    const record: LogRecord = {
      time: '2026-10-23T00:00:01.000Z',
      level: 'error',
      event: 'x',
      fields: {},
    };
    expect(formatRecord(record, 'text')).toBe('00:00:01 ERROR x');
  });

  test('a failure keeps the error name and a redacted message and no stack', () => {
    const { logger, lines } = capture('info', 'json');
    logger.failure('job.failed', new Error('cannot read /data/projects/a/b.yaml'));
    const written = JSON.parse(lines[0].line);
    expect(written.errorName).toBe('Error');
    expect(written.errorMessage).toBe('cannot read <path>');
    expect(lines[0].line).not.toContain('at ');
  });
});

describe('redaction in the logger', () => {
  test('secrets in fields never reach the line or the sinks', () => {
    const { logger, lines, records } = capture('info', 'json');
    logger.info('x', { token: 'abc', detail: 'Bearer abcdefghijkl', cookie: 'sw_session=1' });
    const everything = lines[0].line + JSON.stringify(records);
    expect(everything).not.toContain('abcdefghijkl');
    expect(everything).not.toContain('"abc"');
    expect(everything).not.toContain('sw_session=1');
  });
});

describe('request context', () => {
  test('lines written inside a request carry its id and actor, however deep', async () => {
    const { logger, lines } = capture('info', 'json');
    async function deepInTheCode() {
      await Promise.resolve();
      logger.info('deep');
    }
    await runInRequest({ requestId: 'req-1', actor: 'user-abc' }, async () => {
      logger.info('shallow');
      await deepInTheCode();
    });
    logger.info('outside');
    const [shallow, deep, outside] = lines.map(entry => JSON.parse(entry.line));
    expect(shallow.requestId).toBe('req-1');
    expect(deep.requestId).toBe('req-1');
    expect(deep.actor).toBe('user-abc');
    expect(outside.requestId).toBeUndefined();
  });

  test('two requests at once keep their own ids', async () => {
    const { logger, lines } = capture('info', 'json');
    const run = (id: string) =>
      runInRequest({ requestId: id }, async () => {
        await new Promise(resolve => setTimeout(resolve, id === 'a' ? 5 : 1));
        logger.info('done');
      });
    await Promise.all([run('a'), run('b')]);
    expect(lines.map(entry => JSON.parse(entry.line).requestId).sort()).toEqual(['a', 'b']);
  });
});
