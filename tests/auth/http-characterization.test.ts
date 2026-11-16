// Compares the HTTP contract with the recording made before the boundary extraction.
import { expect, test } from 'bun:test';
import expected from '../fixtures/characterization/http-v1.json';
import { characterizeHttp } from './http-characterization';

test('HTTP responses and audit records equal the original characterization', async () => {
  const actual = await characterizeHttp();
  expect(actual).toHaveLength(expected.length);
  for (const [index, capture] of actual.entries()) {
    expect(capture, `${capture.caller}: ${capture.method} ${capture.path}`).toEqual(expected[index]);
  }
}, 120_000);
