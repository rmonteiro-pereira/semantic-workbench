/** Verifies callback forwarding independently of React's commit lifecycle. */
import { expect, test } from 'bun:test';
import { forwardToLatestHandler } from '../src/app/useStableHandler';

test('A retained callback calls the newest published handler with its arguments', () => {
  const latest = { current: (name: string, count: number) => `${name}: ${count}` };
  const callback = forwardToLatestHandler(latest);
  expect(callback('Orders', 2)).toBe('Orders: 2');
  const nextHandler = (name: string, count: number) => `${name}: ${count * 3}`;
  expect(callback('Orders', 2)).toBe('Orders: 2');
  latest.current = nextHandler;
  expect(callback('Orders', 2)).toBe('Orders: 6');
});

test('Forwarding preserves asynchronous results and thrown errors', async () => {
  const result = Promise.resolve('saved');
  const latest = { current: () => result };
  const callback = forwardToLatestHandler(latest);
  expect(callback()).toBe(result);
  expect(await callback()).toBe('saved');
  const failure = new Error('Unable to save the selected document');
  latest.current = () => {
    throw failure;
  };
  expect(callback).toThrow(failure);
});
