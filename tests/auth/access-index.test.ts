// Verifies that shared authorization work stays within the current policy and request context.
import { test } from 'bun:test';
import { createAccessControl } from '../../src/server/auth/authorize';
import { assertAccessIndexes } from './access-index-assertions';

test('authorization reuse agrees with fresh questions and changes with the active policy', () => {
  assertAccessIndexes(createAccessControl);
}, 30_000);
