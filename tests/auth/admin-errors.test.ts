// Checks the shared HTTP mapping for administration failures.
import { expect, test } from 'bun:test';
import { AdminConfigError, AdminStaleError } from '../../server/auth/admin-repo';
import { AccessConfigError } from '../../server/auth/access-config';
import { errorResponse } from '../../server/routes/http';

test('stale administration versions return a conflict', async () => {
  const response = errorResponse(new AdminStaleError());
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: 'stale' });
});

test('invalid administration and access configurations return input errors', async () => {
  for (const error of [
    new AdminConfigError('roles.json: invalid'),
    new AccessConfigError('grants.json: duplicate'),
  ]) {
    const response = errorResponse(error);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: error.message });
  }
});
