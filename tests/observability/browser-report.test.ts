// What the report schema accepts, refuses and truncates. Browser and server share this file.
import { describe, expect, test } from 'bun:test';
import {
  checkReportBatch,
  type BrowserReport,
  isOverBudget,
  MAX_DURATION_MS,
  MAX_FRAMES_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
  MAX_REPORTS_PER_REQUEST,
  scrubErrorMessage,
} from '../../src/observability/browser-report';

const error = { kind: 'error', name: 'TypeError', message: 'x is not a function' } as const;
const operation = { kind: 'operation', operation: 'save', durationMs: 2500 } as const;

describe('what is accepted', () => {
  test('an error, a rejection and an operation', () => {
    const batch = {
      reports: [
        error,
        { ...error, kind: 'unhandled-rejection' as const, frames: 'at a (b.js:1:2)' },
        operation,
      ],
    };
    const checked = checkReportBatch(batch);
    expect(checked).toEqual({ ok: true, reports: batch.reports as BrowserReport[] });
  });

  test('the largest allowed batch', () => {
    const reports = Array.from({ length: MAX_REPORTS_PER_REQUEST }, () => error);
    expect(checkReportBatch({ reports }).ok).toBe(true);
  });
});

describe('what is refused', () => {
  const refused = (body: unknown) => {
    const checked = checkReportBatch(body);
    expect(checked.ok).toBe(false);
  };

  test('bodies of the wrong shape', () => {
    for (const body of [null, 'text', [], {}, { reports: 'x' }, { reports: [], extra: 1 }]) {
      refused(body);
    }
  });

  test('empty and oversized batches', () => {
    refused({ reports: [] });
    refused({ reports: Array.from({ length: MAX_REPORTS_PER_REQUEST + 1 }, () => error) });
  });

  test('unknown kinds and unknown fields, so nothing else can be smuggled in', () => {
    refused({ reports: [{ ...error, kind: 'click' }] });
    refused({ reports: [{ ...error, fileContent: 'secret' }] });
    refused({ reports: [{ ...operation, path: '/data/x' }] });
    refused({ reports: ['text'] });
  });

  test('text over its limit', () => {
    refused({ reports: [{ ...error, name: 'n'.repeat(MAX_NAME_LENGTH + 1) }] });
    refused({ reports: [{ ...error, message: 'm'.repeat(MAX_MESSAGE_LENGTH + 1) }] });
    refused({ reports: [{ ...error, frames: 'f'.repeat(MAX_FRAMES_LENGTH + 1) }] });
    refused({ reports: [{ ...error, message: '' }] });
  });

  test('text that is not text', () => {
    refused({ reports: [{ ...error, message: { nested: 'object' } }] });
    refused({ reports: [{ ...error, name: 42 }] });
  });

  test('durations that are not plausible', () => {
    refused({ reports: [{ ...operation, durationMs: -1 }] });
    refused({ reports: [{ ...operation, durationMs: MAX_DURATION_MS + 1 }] });
    refused({ reports: [{ ...operation, durationMs: Number.NaN }] });
    refused({ reports: [{ ...operation, durationMs: '5' }] });
  });

  test('operations the workbench does not report', () => {
    refused({ reports: [{ ...operation, operation: 'typing' }] });
  });
});

describe('budgets and scrubbing', () => {
  test('an operation is over budget only past its budget, and a page load has none', () => {
    expect(isOverBudget('validation', 500)).toBe(false);
    expect(isOverBudget('validation', 501)).toBe(true);
    expect(isOverBudget('graph-layout', 2001)).toBe(true);
    expect(isOverBudget('save', 2000)).toBe(false);
    expect(isOverBudget('page-load', 60_000)).toBe(false);
  });

  test('quoted text, which may be a piece of a document, is replaced', () => {
    expect(scrubErrorMessage(`Unexpected token "salary: 90000" in JSON`)).toBe(
      'Unexpected token "…" in JSON',
    );
    expect(scrubErrorMessage("bad 'x' and `y`")).toBe('bad "…" and "…"');
  });

  test('a long message is cut to the limit', () => {
    expect(scrubErrorMessage('a'.repeat(1000)).length).toBe(MAX_MESSAGE_LENGTH);
  });
});
