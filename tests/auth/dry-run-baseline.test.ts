// Keeps the administration replay result fixed before adding origin-specific sampling.
import { expect, test } from 'bun:test';
import expected from '../fixtures/dry-run/baseline.json';
import { dryRunBaseline } from './dry-run-baseline';

test('administration comparison reproduces the original audit replay', () => {
  expect(dryRunBaseline()).toEqual(expected);
}, 30_000);
