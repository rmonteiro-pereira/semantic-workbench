// Compares the HTTP contract with the recording made before the boundary extraction.
import { expect, test } from 'bun:test';
import expected from '../fixtures/characterization/http-v1.json';
import { characterizeHttp } from './http-characterization';

function originalProjectBody(capture: { path?: string; body?: unknown }) {
  if (capture.path !== '/api/projects' || !Array.isArray(capture.body)) return capture.body;
  return capture.body.map(project => {
    if (!project || typeof project !== 'object' || !('published' in project)) return project;
    const { published, ...original } = project;
    expect(published).toMatchObject({ branch: expect.any(String), commit: expect.stringMatching(/^[0-9a-f]{40,64}$/) });
    return original;
  });
}

function canonicalComparison(capture: { audit: unknown[]; path?: string; body?: unknown }) {
  return {
    ...capture,
    body: originalProjectBody(capture),
    audit: capture.audit.map(record => {
      if (!record || typeof record !== 'object' || !('rules' in record) || !Array.isArray(record.rules)) return record;
      // Cedar reports a set of matching rules whose order has no meaning.
      return { ...record, rules: [...record.rules].sort() };
    }),
  };
}

test('HTTP responses and audit records equal the original characterization', async () => {
  const actual = await characterizeHttp();
  expect(actual).toHaveLength(expected.length);
  for (const [index, capture] of actual.entries()) {
    expect(canonicalComparison(capture), `${capture.caller}: ${capture.method} ${capture.path}`).toEqual(canonicalComparison(expected[index]));
  }
}, 120_000);
