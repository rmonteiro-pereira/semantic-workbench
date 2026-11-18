// Verifies all configuration inputs used by the replay's scope sharing.
import { test } from 'bun:test';
import { compareAccess, scopeCache } from '../../src/server/auth/dry-run';
import { assertDeactivatedReplay, assertDryRunScopes, assertReloadedReplay, assertReplayClock, assertReplayScopeSnapshot, assertReplaySurvivesReload } from './dry-run-scope-assertions';

test('dry-run scope sharing changes with every policy input it uses', () => {
  assertDryRunScopes(compareAccess);
}, 30_000);

test('replay compares the proposal to the control after a policy reload', () => {
  assertReloadedReplay(compareAccess);
});

test('deactivated people retain proposed Cedar denial evidence after group grant removal', () => {
  assertDeactivatedReplay(scopeCache);
});

test('both sides replay with one default context across an hour boundary', () => {
  assertReplayClock(compareAccess);
});

test('direct replay scopes use the reloaded policy and sample the control clock', () => {
  assertReplayScopeSnapshot(scopeCache);
});

test('cached and new replay scopes retain their captured policies after reload', () => {
  assertReplaySurvivesReload(scopeCache);
});
