// Checks the shared expression reader on 0.3 draft forms: the portable sql wins, and function calls are found outside literals and comments.
import { expect, test } from 'bun:test';
import { ansiExpression, functionCalls, metricDependencies } from '../src/shared/metrics/deps';

test('the portable sql is read before any dialect, and a 0.2 expression reads as before', () => {
  expect(ansiExpression({ expression: { sql: 'SUM(amount)', dialects: [{ dialect: 'ANSI_SQL', expression: 'COUNT(id)' }] } })).toBe('SUM(amount)');
  expect(
    ansiExpression({
      expression: {
        dialects: [
          { dialect: 'DAX', expression: 'x' },
          { dialect: 'ANSI_SQL', expression: 'COUNT(id)' },
        ],
      },
    }),
  ).toBe('COUNT(id)');
});

test('metric dependencies are found in a sql expression', () => {
  expect(metricDependencies('revenue / NULLIF(order_count, 0)', new Set(['revenue', 'order_count']))).toEqual(['revenue', 'order_count']);
});

test('function calls keep their argument when it is one name chain, and skip strings and comments', () => {
  expect(functionCalls("AGG(orders.total) + metric(x) -- AGG(hidden.one)\n + 'AGG(text.only)'")).toEqual([
    { name: 'AGG', argument: { table: 'orders', column: 'total' }, filtered: false },
    { name: 'metric', argument: { table: null, column: 'x' }, filtered: false },
  ]);
  expect(functionCalls('SUM(a + b)')).toEqual([{ name: 'SUM', argument: null, filtered: false }]);
  expect(functionCalls('AGG(source.total) FILTER (WHERE active)')[0].filtered).toBe(true);
});
