// Verifies all configuration inputs used by the replay's scope sharing.
import { test } from 'bun:test';
import { compareAccess } from '../../src/server/auth/dry-run';
import { assertDryRunScopes } from './dry-run-scope-assertions';

test('dry-run scope sharing changes with every policy input it uses', () => {
  assertDryRunScopes(compareAccess);
}, 30_000);
