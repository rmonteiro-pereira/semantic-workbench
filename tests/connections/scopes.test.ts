// Checks the scope table, the reserved scope and that no scope reaches irreversible operations.
import { expect, test } from 'bun:test';
import { DEFAULT_SCOPES, SCOPES, SCOPE_EFFECTS, effectsOf, isOfferedScope, offeredScopes, parseScopeParameter } from '../../src/server/connections/scopes';

test('each scope carries the effects of the table', () => {
  expect(effectsOf(['read'])).toEqual(['read']);
  expect(effectsOf(['validate'])).toEqual(['read']);
  expect(effectsOf(['edit'])).toEqual(['localWrite']);
  expect(effectsOf(['commit'])).toEqual(['commit']);
  expect(effectsOf(['remote']).sort()).toEqual(['credential', 'remote']);
  expect(effectsOf(['publish'])).toEqual(['publish']);
  expect(effectsOf(['administration'])).toEqual(['administration']);
});

test('read and validate together do not repeat the read effect', () => {
  expect(effectsOf(['read', 'validate'])).toEqual(['read']);
});

test('no scope carries the destroy effect', () => {
  for (const scope of SCOPES) expect(SCOPE_EFFECTS[scope]).not.toContain('destroy');
});

test('the administration scope is reserved and never offered', () => {
  expect(offeredScopes()).not.toContain('administration');
  expect(isOfferedScope('administration')).toBe(false);
  expect(parseScopeParameter('read administration')).toEqual({ ok: false, reason: 'unknown-scope' });
});

test('the defaults are read, validate, edit and commit', () => {
  expect([...DEFAULT_SCOPES]).toEqual(['read', 'validate', 'edit', 'commit']);
  expect(parseScopeParameter('')).toEqual({ ok: true, scopes: [] });
});

test('a scope parameter is sorted, deduplicated and refuses unknown names', () => {
  expect(parseScopeParameter('commit read read')).toEqual({ ok: true, scopes: ['read', 'commit'] });
  expect(parseScopeParameter('read write')).toEqual({ ok: false, reason: 'unknown-scope' });
  expect(parseScopeParameter('READ')).toEqual({ ok: false, reason: 'unknown-scope' });
});
