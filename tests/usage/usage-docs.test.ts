// Tests that the guide documents exactly the fields the counters store.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dataLayout } from '../../src/server/projects/paths';
import { addCount, emptyDayFile } from '../../src/server/usage/usage-counts';
import { createUsageStore } from '../../src/server/usage/usage-store';
import { USAGE_MEASURES } from '../../src/server/usage/usage-counted-operations';
import { tempDataDir } from '../helpers/temp-data-dir';

const guide = readFileSync('docs/usage-counters.md', 'utf8');

function documentedFields(): string[] {
  const section = guide.slice(guide.indexOf('## What is stored'), guide.indexOf('## When counts are written'));
  return [...section.matchAll(/^\| `([A-Za-z]+)` \|/gm)].map(match => match[1]).sort();
}

describe('the guide', () => {
  test('documents exactly the fields of a stored day file', () => {
    const directory = tempDataDir('usage-docs-');
    try {
      const store = createUsageStore(dataLayout(directory.root));
      const file = { ...emptyDayFile('shop', '2026-11-17'), other: 3 };
      addCount(file.counts, { address: 'sw1:shop/a.yaml#model:M/metric:x', measure: 'workbench-requests', operation: 'agent.plan', origin: 'http' });
      store.writeDay(file);
      const stored = JSON.parse(readFileSync(store.dayPath('shop', '2026-11-17'), 'utf8'));
      expect(documentedFields()).toEqual(Object.keys(stored).sort());
    } finally {
      directory.cleanup();
    }
  });

  test('names the three labels a count is held under and the measures that exist', () => {
    expect(guide).toContain('one `measure`');
    expect(guide).toContain('one `operation`');
    expect(guide).toContain('one `origin`');
    for (const measure of USAGE_MEASURES) expect(guide).toContain(measure);
  });

  test('states what the README must: browser views are excluded, a small team may infer who asked, the retention and how to turn counters on', () => {
    expect(guide).toMatch(/Browser views do not add/);
    expect(guide).toMatch(/small team, a count of one/);
    expect(guide).not.toMatch(/\banonymous (usage|counters)\b/i);
    expect(guide).toContain('SW_USAGE_COUNTERS');
    expect(guide).toContain('| `SW_USAGE_RETENTION_DAYS` | `30` |');
  });

  test('labels counts as requests through this workbench, never as queries or popularity', () => {
    expect(guide).toContain('requests through this workbench');
    expect(guide).toMatch(/do\s+not count queries run in a warehouse, use in production or the popularity of data/);
  });
});
