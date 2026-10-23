// Tests that SW_BRAND_DIR is read by the start-up configuration and refused when it is unusable.
import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, readConfig } from '../../server/config';

test('no brand folder means the shipped brand', () => {
  expect(readConfig({}).brandDir).toBeNull();
  expect(readConfig({ SW_BRAND_DIR: '' }).brandDir).toBeNull();
});

test('an existing folder is accepted', () => {
  const folder = mkdtempSync(join(tmpdir(), 'workbench-brand-config-'));
  try {
    expect(readConfig({ SW_BRAND_DIR: folder }).brandDir).toBe(folder);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('a missing folder or a file stops the start and names the variable', () => {
  const folder = mkdtempSync(join(tmpdir(), 'workbench-brand-config-'));
  const file = join(folder, 'brand.json');
  writeFileSync(file, '{}');
  try {
    for (const value of [join(folder, 'missing'), file]) {
      try {
        readConfig({ SW_BRAND_DIR: value });
        throw new Error('start-up should have been refused');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        expect((error as ConfigError).problems.map(problem => problem.variable)).toEqual([
          'SW_BRAND_DIR',
        ]);
      }
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
