// Every status a twin route answers maps to one tool failure, a hidden target reads like a missing one, and no path or file text reaches an internal failure.
import { expect, test } from 'bun:test';
import { mapTwinFailure, type TwinAnswer } from '../../src/server/mcp/twin-dispatch';

const answer = (status: number, body: unknown): TwinAnswer => ({ status, body, headers: new Headers() });
const codeOf = (operation: string, status: number, body: unknown) => {
  const result = mapTwinFailure(operation, answer(status, body));
  if (result.ok) throw new Error('A failure was expected.');
  return result.error;
};

test('each status maps to its code', () => {
  expect(codeOf('files.read', 404, { error: 'Not found.' }).code).toBe('not_found');
  expect(codeOf('files.save', 403, { error: 'forbidden', rule: 'x' }).code).toBe('refused');
  expect(codeOf('files.save', 403, { error: 'The guard says no.', guarded: [{ file: 'a', pointer: '/', kind: 'approval' }] })).toMatchObject({ code: 'guard_refused', message: 'The guard says no.' });
  expect(codeOf('files.save', 409, { error: 'stale', currentHash: 'a'.repeat(64), currentSource: 'SECRET TEXT' })).toMatchObject({ code: 'conflict', details: { currentVersion: 'a'.repeat(64) } });
  expect(JSON.stringify(codeOf('files.save', 409, { error: 'stale', currentHash: 'a', currentSource: 'SECRET TEXT' }))).not.toContain('SECRET TEXT');
  expect(codeOf('git.commit', 409, { error: 'precondition', changed: { head: {} } }).code).toBe('precondition_failed');
  expect(codeOf('agent.catalog.read', 409, { code: 'no-published-snapshot', reason: 'no-commit' })).toMatchObject({ code: 'not_published', details: { reason: 'no-commit' } });
  expect(codeOf('files.save', 413, { error: 'Too large.', limitBytes: 5 }).code).toBe('limit_exceeded');
  expect(codeOf('files.save', 400, { error: 'baseHash must be a hash.' }).code).toBe('invalid_input');
  expect(codeOf('agent.context.read', 400, { error: 'Project not found.' }).code).toBe('not_found');
  expect(codeOf('git.status', 400, { error: 'Git is not available on this machine.' }).code).toBe('unavailable');
  expect(codeOf('git.commit', 500, { error: 'Nothing to commit: the chosen files match the last commit.' }).code).toBe('refused');
  expect(codeOf('git.log', 500, { error: 'fatal: /home/person/data/projects/x failed' })).toMatchObject({ code: 'unavailable', message: 'Git could not answer this request.' });
});

test('an unexpected failure is generic and names no path or file text', () => {
  const failure = codeOf('files.save', 500, { error: 'ENOENT /home/person/secret/file.yaml: contents SECRET' });
  expect(failure.code).toBe('internal');
  expect(JSON.stringify(failure)).not.toMatch(/home|secret|ENOENT/i);
});

test('a hidden target and a missing one answer the same words', () => {
  expect(codeOf('files.read', 404, { error: 'Not found.' })).toEqual(codeOf('files.read', 404, { error: 'File not found.' }));
});
