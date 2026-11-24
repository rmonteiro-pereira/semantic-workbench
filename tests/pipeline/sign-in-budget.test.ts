import { expect, test } from 'bun:test';
import { assertAuthenticationTime } from '../../scripts/helpers/sign-in';

test('the authentication budget refuses a successful callback after five seconds', () => {
  expect(() => assertAuthenticationTime('alice', 4_999)).not.toThrow();
  expect(() => assertAuthenticationTime('alice', 5_000)).toThrow('5000 ms (limit 5000 ms)');
});
